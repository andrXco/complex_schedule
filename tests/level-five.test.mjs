import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareLevelFour } from "../src/application/scheduling/prepare-level-four.ts";
import {
  prepareLevelFive,
  validateLevelFiveSelection,
} from "../src/application/scheduling/prepare-level-five.ts";

const example = JSON.parse(
  readFileSync(new URL("./selenium/fixtures/franja.json", import.meta.url), "utf8"),
);
const ids = ({ courses }) => courses.map(({ sectionId }) => sectionId);

test("acepta sesiones en los extremos inclusivos y filtra las que exceden por un minuto", () => {
  const result = prepareLevelFive(example, 1);
  assert.equal(result.level, 5);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.preferredWindow, { startMinute: 480, endMinute: 960 });
  assert.deepEqual(result.schedules.map(ids), [["A1", "B1"]]);
  assert.equal(prepareLevelFour(example).schedules.length, 4);
});

test("una sola sesión fuera de la franja vuelve ineligible al grupo", () => {
  const input = structuredClone(example);
  input.catalogo.grupos[1].sesiones.push({ dia: "viernes", inicio: "07:30", fin: "08:30" });
  const blocked = prepareLevelFive(input);
  assert.deepEqual(blocked.schedules, []);
  assert.match(blocked.reason, /franja horaria preferida/);
  assert.equal(blocked.truncated, false);
});

test("la preferencia omitida o vacía conserva las mismas opciones del nivel 4", () => {
  for (const franja of [undefined, {}]) {
    const input = structuredClone(example);
    input.estudiante.franja = franja;
    const result = prepareLevelFive(input, 2);
    const baseline = prepareLevelFour(input, 2);
    assert.equal(result.preferredWindow, null);
    assert.equal(result.truncated, baseline.truncated);
    assert.deepEqual(result.schedules, baseline.schedules);
  }
});

test("admite minutos enteros y una franja que cubra el día completo", () => {
  const input = structuredClone(example);
  input.estudiante.franja = { inicio: 480, fin: 960 };
  assert.deepEqual(prepareLevelFive(input).schedules.map(ids), [["A1", "B1"]]);
  input.estudiante.franja = { inicio: "00:00", fin: "24:00" };
  assert.equal(prepareLevelFive(input).schedules.length, 4);
});

test("valida la forma, los extremos requeridos y el orden de la franja", () => {
  for (const franja of [
    [],
    null,
    { inicio: "08:00" },
    { fin: "16:00" },
    { horaInicio: "08:00" },
    { inicio: "08:99", fin: "16:00" },
    { inicio: "08:00", fin: "08:00" },
    { inicio: "16:00", fin: "08:00" },
    { inicio: -1, fin: 960 },
    { inicio: 480, fin: 1441 },
  ]) {
    const input = structuredClone(example);
    input.estudiante.franja = franja;
    assert.throws(() => prepareLevelFive(input), /estudiante.franja/);
  }
});

test("conserva la maximalidad de las opcionales y el límite de huecos de los niveles anteriores", () => {
  const input = structuredClone(example);
  input.estudiante.materias[1].prioridad = "media";
  delete input.estudiante.creditosMin;
  input.catalogo.grupos = input.catalogo.grupos.filter(({ id }) => id !== "B1");
  assert.deepEqual(prepareLevelFive(input).schedules, []);

  const gap = structuredClone(example);
  gap.catalogo.grupos[3].sesiones[0].dia = "lunes";
  assert.deepEqual(prepareLevelFive(gap).schedules, []);
  assert.throws(
    () =>
      validateLevelFiveSelection(gap, {
        courses: [
          { courseId: "A", sectionId: "A1" },
          { courseId: "B", sectionId: "B1" },
        ],
      }),
    /hueco/,
  );
});

test("reconstruye cada sesión del catálogo antes de guardar y no confía en los horarios enviados", () => {
  const selection = {
    courses: [
      { courseId: "A", sectionId: "A1", meetings: [] },
      { courseId: "B", sectionId: "B0", meetings: [] },
    ],
  };
  assert.throws(
    () => validateLevelFiveSelection(example, selection),
    /grupo B0.*fuera de la franja/,
  );
  selection.courses[1].sectionId = "B1";
  assert.deepEqual(validateLevelFiveSelection(example, selection).courses[1].meetings, [
    { day: "6", startMinute: 900, endMinute: 960 },
  ]);
});

test("equivale a filtrar el nivel 4 antes del límite en 80 catálogos reproducibles", () => {
  for (let index = 0; index < 80; index += 1) {
    const input = structuredClone(example);
    input.catalogo.grupos[0].sesiones[0].inicio = 450 + index;
    input.catalogo.grupos[2].sesiones[0].fin = 920 + index;
    const startMinute = 465 + (index % 31);
    const endMinute = 960 - (index % 27);
    input.estudiante.franja = { inicio: startMinute, fin: endMinute };
    const expected = prepareLevelFour(input).schedules.filter(({ courses }) =>
      courses
        .flatMap(({ meetings }) => meetings)
        .every((meeting) => meeting.startMinute >= startMinute && meeting.endMinute <= endMinute),
    );
    const actual = prepareLevelFive(input, 1);
    assert.deepEqual(actual.schedules.map(ids), expected.slice(0, 1).map(ids));
    assert.equal(actual.truncated, expected.length > 1);
  }
});
