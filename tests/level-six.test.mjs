import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareLevelFive } from "../src/application/scheduling/prepare-level-five.ts";
import {
  prepareLevelSix,
  validateLevelSixSelection,
} from "../src/application/scheduling/prepare-level-six.ts";

const sample = JSON.parse(
  readFileSync(new URL("../public/horario-ejemplo.json", import.meta.url), "utf8"),
);
const ids = ({ courses }) => courses.map(({ sectionId }) => sectionId);

test("normaliza días libres y descarta un grupo si alguna sesión coincide", () => {
  const input = structuredClone(sample);
  input.estudiante.diasLibres = [" SÁB ", 4];
  assert.deepEqual(prepareLevelSix(input).daysOff, ["6", "4"]);
  assert.deepEqual(prepareLevelSix(input).schedules, []);
  input.estudiante.diasLibres = ["sábado"];
  input.catalogo.grupos[0].sesiones.push({ dia: "sábado", inicio: 540, fin: 600 });
  const result = prepareLevelSix(input, 1);
  assert.deepEqual(result.schedules.map(ids), [["ALG-02", "EST-01", "SOF-02"]]);
  assert.equal(result.truncated, false);
});

test("una lista omitida o vacía conserva los horarios del nivel 5", () => {
  for (const diasLibres of [[], undefined]) {
    const input = structuredClone(sample);
    input.estudiante.diasLibres = diasLibres;
    assert.deepEqual(prepareLevelSix(input).schedules, prepareLevelFive(input).schedules);
  }
});

test("rechaza días inválidos y días repetidos después de normalizarlos", () => {
  for (const diasLibres of [["lunes", 1], ["domingo"], ["7"], [[1]], [null], null, "lunes"]) {
    const input = structuredClone(sample);
    input.estudiante.diasLibres = diasLibres;
    assert.throws(() => prepareLevelSix(input), /estudiante.diasLibres/);
  }
});

test("preserva la evaluación de adiciones del nivel 1 aunque el grupo esté en un día libre", () => {
  const input = structuredClone(sample);
  input.estudiante.diasLibres = ["viernes"];
  assert.equal(prepareLevelFive(input).schedules.length, 2);
  assert.deepEqual(prepareLevelSix(input).schedules, []);
  assert.match(prepareLevelSix(input).reason, /días libres solicitados/);
  input.estudiante.creditosMax = 8;
  assert.ok(prepareLevelSix(input).schedules.every(({ courses }) => courses.length === 2));
  assert.equal(prepareLevelSix(input).schedules.length, 2);
});

test("reconstruye las sesiones antes de guardar y rechaza las de días libres", () => {
  const input = structuredClone(sample);
  const { courses } = prepareLevelFive(input).schedules[0];
  const choice = {
    courses: courses.map(({ courseId, sectionId }) => ({ courseId, sectionId, meetings: [] })),
  };
  assert.equal(validateLevelSixSelection(input, choice).totalCredits, 11);
  input.estudiante.diasLibres = ["viernes"];
  assert.throws(() => validateLevelSixSelection(input, choice), /grupo SOF-02.*día libre/);
});
