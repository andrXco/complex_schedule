import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareLevelThree,
  validateLevelThreeSelection,
} from "../src/application/scheduling/prepare-level-three.ts";
import { prepareLevelTwo } from "../src/application/scheduling/prepare-level-two.ts";
import { overlapsLunch } from "../src/domain/scheduling/lunch-window.ts";

function group(id, materiaId, inicio, fin, dia = "lunes") {
  return { id, materiaId, cuposDisponibles: 1, sesiones: [{ dia, inicio, fin }] };
}

function source(groups, requests = [["A", "alta", 4]], limits = {}) {
  return {
    catalogo: {
      materias: requests.map(([id, , creditos]) => ({ id, creditos })),
      grupos: groups,
    },
    estudiante: {
      materias: requests.map(([materiaId, prioridad]) => ({ materiaId, prioridad })),
      ...limits,
    },
  };
}

function ids(schedules) {
  return schedules.map(({ courses }) => courses.map(({ sectionId }) => sectionId));
}

test("protege cada minuto del almuerzo y permite sesiones contiguas en ambos extremos", () => {
  for (const [startMinute, endMinute, expected] of [
    [720, 780, false],
    [840, 900, false],
    [779, 781, true],
    [839, 841, true],
    [780, 840, true],
    [720, 900, true],
    [800, 820, true],
  ]) {
    assert.equal(overlapsLunch({ day: "6", startMinute, endMinute }), expected);
  }
});

test("selecciona grupos fuera del almuerzo aunque otro grupo se cruce en una sola sesión", () => {
  const atLunch = group("A-almuerzo", "A", "09:00", "10:00");
  atLunch.sesiones.push({ dia: "sábado", inicio: 839, fin: 900 });
  const before = group("A-antes", "A", 720, 780, "viernes");
  const after = group("A-después", "A", 840, 900, "sábado");
  const input = source([atLunch, before, after], undefined, { creditosMin: 4, creditosMax: 4 });
  assert.deepEqual(ids(prepareLevelTwo(input).schedules), [
    ["A-almuerzo"],
    ["A-antes"],
    ["A-después"],
  ]);
  const result = prepareLevelThree(input);
  assert.equal(result.level, 3);
  assert.equal(result.reason, null);
  assert.deepEqual(ids(result.schedules), [["A-antes"], ["A-después"]]);
});

test("cuenta solo horarios del nivel 3 al aplicar el límite de resultados", () => {
  const atLunch = group("A1", "A", 780, 840);
  const after = group("A2", "A", 840, 900);
  const input = source([atLunch, after]);
  assert.deepEqual(ids(prepareLevelTwo(input, 1).schedules), [["A1"]]);
  const unique = prepareLevelThree(input, 1);
  assert.deepEqual(ids(unique.schedules), [["A2"]]);
  assert.equal(unique.truncated, false);
  input.catalogo.grupos.push(group("A3", "A", 720, 780));
  assert.equal(prepareLevelThree(input, 1).truncated, true);
});

test("informa una búsqueda sin horarios cuando todas las opciones de una alta cruzan el almuerzo", () => {
  const input = source([group("A1", "A", 779, 781), group("A2", "A", 839, 841, "martes")]);
  const result = prepareLevelThree(input);
  assert.deepEqual(result.schedules, []);
  assert.equal(result.truncated, false);
  assert.match(result.reason, /ventana de almuerzo de 13:00 a 14:00/);
  input.catalogo.grupos = [];
  assert.match(prepareLevelThree(input).reason, /Materia alta A: sin grupos/);
});

test("conserva los grupos de almuerzo al evaluar si una opcional podría agregarse en el nivel 1", () => {
  const input = source(
    [group("A1", "A", 720, 780), group("M1", "M", 780, 840)],
    [
      ["A", "alta", 4],
      ["M", "media", 3],
    ],
  );
  assert.deepEqual(ids(prepareLevelTwo(input).schedules), [["A1", "M1"]]);
  assert.deepEqual(prepareLevelThree(input).schedules, []);

  input.estudiante.creditosMax = 4;
  const result = prepareLevelThree(input);
  assert.deepEqual(ids(result.schedules), [["A1"]]);
  assert.deepEqual(result.schedules[0].omitted, [
    { courseId: "M", reasons: ["agregarla supera el máximo de créditos"] },
  ]);
});

test("mantiene la preferencia por una media aunque su sustitución cruce el almuerzo", () => {
  const input = source(
    [group("A1", "A", 720, 780), group("M1", "M", 780, 840), group("B1", "B", 840, 900)],
    [
      ["A", "alta", 4],
      ["M", "media", 3],
      ["B", "baja", 3],
    ],
    { creditosMax: 7 },
  );
  assert.deepEqual(ids(prepareLevelTwo(input).schedules), [["A1", "M1"]]);
  assert.deepEqual(prepareLevelThree(input).schedules, []);
  assert.throws(
    () =>
      validateLevelThreeSelection(input, {
        courses: [
          { courseId: "A", sectionId: "A1" },
          { courseId: "B", sectionId: "B1" },
        ],
      }),
    /puede sustituir/,
  );
});

test("al guardar usa las sesiones del catálogo y conserva el total de créditos", () => {
  const input = source([group("A1", "A", 780, 840), group("A2", "A", 840, 900)]);
  const courses = [{ courseId: "A", sectionId: "A1", meetings: [] }];
  assert.throws(() => validateLevelThreeSelection(input, { courses }), /grupo A1.*almuerzo/);
  courses[0].sectionId = "A2";
  const saved = validateLevelThreeSelection(input, { courses, totalCredits: 999 });
  assert.equal(saved.totalCredits, 4);
  assert.deepEqual(saved.courses[0].meetings, [{ day: "1", startMinute: 840, endMinute: 900 }]);
});

test("coincide con filtrar todos los horarios de nivel 2 en 120 catálogos reproducibles", () => {
  let seed = 0x75ad4f20;
  function random(max) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 2 ** 32) * max);
  }
  const priorities = ["alta", "media", "baja"];
  for (let index = 0; index < 120; index += 1) {
    const requests = ["A", "B", "C", "D"].map((id) => [id, priorities[random(3)], 1 + random(4)]);
    const groups = requests.flatMap(([id]) =>
      Array.from({ length: 1 + random(3) }, (_, section) => {
        const start = 690 + 30 * random(8);
        const result = group(`${id}${section}`, id, start, start + 60, 1 + random(6));
        result.cuposDisponibles = random(3);
        return result;
      }),
    );
    const min = 1 + random(6);
    const input = source(
      groups,
      requests,
      index % 3
        ? {
            creditosMin: min,
            creditosMax: min + random(8),
          }
        : {},
    );
    const baseline = prepareLevelTwo(input, 500);
    assert.equal(baseline.truncated, false);
    const expected = baseline.schedules.filter(({ courses }) =>
      courses.every(({ meetings }) =>
        meetings.every(
          ({ startMinute, endMinute }) => Math.max(startMinute, 780) >= Math.min(endMinute, 840),
        ),
      ),
    );
    const full = prepareLevelThree(input, 500);
    assert.deepEqual(ids(full.schedules), ids(expected), `catálogo ${index}`);
    assert.equal(full.truncated, false);
    const capped = prepareLevelThree(input, 2);
    assert.deepEqual(ids(capped.schedules), ids(expected.slice(0, 2)));
    assert.equal(capped.truncated, expected.length > 2);
  }
});
