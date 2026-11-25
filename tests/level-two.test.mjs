import assert from "node:assert/strict";
import test from "node:test";
import { prepareLevelOne } from "../src/application/scheduling/prepare-level-one.ts";
import {
  prepareLevelTwo,
  validateLevelTwoSelection,
} from "../src/application/scheduling/prepare-level-two.ts";

function source(limits = {}) {
  return {
    catalogo: {
      materias: [
        { id: "A", creditos: 4 },
        { id: "M", creditos: 3 },
        { id: "B", creditos: 2 },
      ],
      grupos: [
        {
          id: "A1",
          materiaId: "A",
          cuposDisponibles: 1,
          sesiones: [
            { dia: "lunes", inicio: "08:00", fin: "09:00" },
            { dia: "martes", inicio: "08:00", fin: "09:00" },
          ],
        },
        {
          id: "M1",
          materiaId: "M",
          cuposDisponibles: 1,
          sesiones: [{ dia: "lunes", inicio: "09:00", fin: "10:00" }],
        },
        {
          id: "B1",
          materiaId: "B",
          cuposDisponibles: 1,
          sesiones: [{ dia: "lunes", inicio: "10:00", fin: "11:00" }],
        },
      ],
    },
    estudiante: {
      materias: [
        { materiaId: "A", prioridad: "alta" },
        { materiaId: "M", prioridad: "media" },
        { materiaId: "B", prioridad: "baja" },
      ],
      ...limits,
    },
  };
}

function selections(schedules) {
  return schedules.map(({ courses }) => courses.map(({ sectionId }) => sectionId));
}

test("incluye ambos extremos y cuenta cada materia una vez aunque tenga varias sesiones", () => {
  const bounded = prepareLevelTwo(source({ creditosMin: 7, creditosMax: 7 }));
  assert.equal(bounded.level, 2);
  assert.equal(bounded.reason, null);
  assert.equal(bounded.minCredits, 7);
  assert.equal(bounded.maxCredits, 7);
  assert.deepEqual(selections(bounded.schedules), [["A1", "M1"]]);
  assert.equal(bounded.schedules[0].totalCredits, 7);
  assert.equal(bounded.schedules[0].courses[0].meetings.length, 2);
  assert.deepEqual(bounded.schedules[0].omitted, [
    { courseId: "B", reasons: ["agregarla supera el máximo de créditos"] },
  ]);
});

test("acepta que los límites se omitan juntos o por separado", () => {
  const unbounded = prepareLevelTwo(source());
  assert.equal(unbounded.minCredits, 0);
  assert.equal(unbounded.maxCredits, null);
  assert.equal(unbounded.schedules[0].totalCredits, 9);

  const minimumOnly = prepareLevelTwo(source({ creditosMin: 9 }));
  assert.equal(minimumOnly.maxCredits, null);
  assert.equal(minimumOnly.schedules[0].totalCredits, 9);

  const maximumOnly = prepareLevelTwo(source({ creditosMax: 7 }));
  assert.equal(maximumOnly.minCredits, 0);
  assert.equal(maximumOnly.schedules[0].totalCredits, 7);
});

test("informa cuando el mínimo no se puede alcanzar o las altas superan el máximo", () => {
  const below = prepareLevelTwo(source({ creditosMin: 10 }));
  assert.deepEqual(below.schedules, []);
  assert.match(below.reason, /al menos 10 créditos/);
  const above = prepareLevelTwo(source({ creditosMax: 3 }));
  assert.deepEqual(above.schedules, []);
  assert.match(above.reason, /hasta 3 créditos/);
  assert.equal(above.truncated, false);
});

test("conserva el motivo específico si una alta no tiene un grupo elegible", () => {
  const input = source({ creditosMin: 5, creditosMax: 7 });
  input.catalogo.grupos[0].cuposDisponibles = 0;
  assert.match(prepareLevelTwo(input).reason, /Materia alta A: sin grupos con cupos/);
});

test("considera el rango antes del límite de resultados y reporta truncamiento real", () => {
  const input = source({ creditosMin: 7, creditosMax: 7 });
  assert.equal(prepareLevelOne(input, 1).schedules[0].totalCredits, 9);
  const unique = prepareLevelTwo(input, 1);
  assert.deepEqual(selections(unique.schedules), [["A1", "M1"]]);
  assert.equal(unique.truncated, false);

  input.catalogo.grupos.push({ ...input.catalogo.grupos[1], id: "M2" });
  const duplicated = prepareLevelTwo(input, 1);
  assert.equal(duplicated.schedules.length, 1);
  assert.equal(duplicated.truncated, true);
});

test("conserva el criterio de sustitución aunque el cambio bajara del mínimo", () => {
  const input = source({ creditosMin: 7, creditosMax: 7 });
  input.catalogo.materias[1].creditos = 2;
  input.catalogo.materias[2].creditos = 3;
  input.catalogo.grupos[2].sesiones[0].inicio = "09:30";
  const result = prepareLevelTwo(input);
  assert.deepEqual(result.schedules, []);
  assert.match(result.reason, /7 créditos exactos/);
  assert.throws(
    () =>
      validateLevelTwoSelection(input, {
        courses: [
          { courseId: "A", sectionId: "A1" },
          { courseId: "B", sectionId: "B1" },
        ],
      }),
    /puede sustituir/,
  );
});

test("rechaza rangos invertidos y valores inválidos con el nombre del campo", () => {
  for (const value of [null, 0, -1, 1.5, "7", Number.MAX_SAFE_INTEGER + 1]) {
    for (const field of ["creditosMin", "creditosMax"]) {
      assert.throws(() => prepareLevelTwo(source({ [field]: value })), new RegExp(field));
    }
  }
  const inverted = source({ creditosMin: 8, creditosMax: 7 });
  assert.throws(() => prepareLevelTwo(inverted), /creditosMin debe ser menor o igual/);
  assert.doesNotThrow(() => prepareLevelOne(inverted));
});

test("al guardar usa los créditos del catálogo aunque el cliente envíe otro total", () => {
  const over = source({ creditosMax: 7 });
  const tooMany = prepareLevelOne(over).schedules[0];
  assert.throws(
    () => validateLevelTwoSelection(over, { ...tooMany, totalCredits: 7 }),
    /suma 9 créditos y el máximo es 7/,
  );
  const under = source({ creditosMin: 10 });
  const tooFew = prepareLevelOne(under).schedules[0];
  assert.throws(
    () => validateLevelTwoSelection(under, { ...tooFew, totalCredits: 10 }),
    /suma 9 créditos y el mínimo es 10/,
  );
  const exact = source({ creditosMin: 7, creditosMax: 7 });
  const { name, ...schedule } = prepareLevelTwo(exact).schedules[0];
  assert.deepEqual(
    validateLevelTwoSelection(exact, { ...schedule, totalCredits: 1, omitted: [] }),
    schedule,
  );
});

test("la búsqueda con podas coincide con el filtrado completo en 120 catálogos reproducibles", () => {
  let seed = 0xa712a37d;
  function random(max) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 2 ** 32) * max);
  }
  for (let index = 0; index < 120; index += 1) {
    const minCredits = 1 + random(13);
    const maxCredits = minCredits + random(7);
    const input = source({ creditosMin: minCredits, creditosMax: maxCredits });
    for (const subject of input.catalogo.materias) {
      subject.creditos = 1 + random(7);
    }
    const priorities = ["alta", "media", "baja"];
    for (const request of input.estudiante.materias) {
      request.prioridad = priorities[random(3)];
    }
    input.catalogo.grupos = input.catalogo.grupos.flatMap((group) =>
      Array.from({ length: random(4) }, (_, section) => {
        const start = 480 + 30 * random(6);
        return {
          ...group,
          id: `${group.id}-${section}`,
          cuposDisponibles: random(3),
          sesiones: [{ dia: 1 + random(2), inicio: start, fin: start + 60 }],
        };
      }),
    );
    const all = prepareLevelOne(input, 500);
    assert.equal(all.truncated, false);
    const expected = all.schedules.filter(
      ({ totalCredits }) => totalCredits >= minCredits && totalCredits <= maxCredits,
    );
    const result = prepareLevelTwo(input, 500);
    assert.equal(result.truncated, false);
    assert.deepEqual(selections(result.schedules), selections(expected), `catálogo ${index}`);

    const capped = prepareLevelTwo(input, 2);
    assert.deepEqual(selections(capped.schedules), selections(expected.slice(0, 2)));
    assert.equal(capped.truncated, expected.length > 2);
  }
});
