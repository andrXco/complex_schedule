import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareLevelSix } from "../src/application/scheduling/prepare-level-six.ts";
import {
  prepareLevelSeven,
  validateLevelSevenSelection,
} from "../src/application/scheduling/prepare-level-seven.ts";

const input = JSON.parse(
  readFileSync(new URL("./selenium/fixtures/profesores.json", import.meta.url), "utf8"),
);
const ids = ({ courses }) => courses.map(({ sectionId }) => sectionId);

test("filtra profesores y ordena por posición antes de truncar, con desempate estable", () => {
  const full = prepareLevelSeven(input);
  assert.equal(full.professorPreferences, true);
  assert.deepEqual(full.schedules.map(ids), [["A1"], ["A3"], ["A2"]]);
  assert.deepEqual(
    full.schedules.map(({ professorPreferenceScore }) => professorPreferenceScore),
    [0, 0, 1],
  );
  assert.equal(full.schedules[0].courses[0].professor.name, "Ana Pérez");
  assert.equal(full.truncated, false);
  const capped = prepareLevelSeven(input, 1);
  assert.deepEqual(capped.schedules.map(ids), [["A1"]]);
  assert.equal(capped.truncated, true);
});

test("conserva todos los grupos cuando se omite o se vacía la lista", () => {
  for (const professors of [[], undefined]) {
    const source = structuredClone(input);
    source.estudiante.materias[0].profesoresPreferidos = professors;
    const result = prepareLevelSeven(source, 2);
    assert.equal(result.professorPreferences, false);
    assert.deepEqual(result.schedules.map(ids), prepareLevelSix(source, 2).schedules.map(ids));
    assert.ok(
      result.schedules.every(({ professorPreferenceScore }) => professorPreferenceScore === 0),
    );
  }
});

test("informa la materia solicitada que carece de grupos con profesores de su lista", () => {
  const source = structuredClone(input);
  source.estudiante.creditosMax = 3;
  source.estudiante.materias[0].prioridad = "baja";
  source.estudiante.materias[0].profesoresPreferidos = ["P4"];
  source.catalogo.profesores.push({ id: "P4", nombre: "Docente sin grupo" });
  assert.equal(prepareLevelSix(source).schedules.length, 1);
  const result = prepareLevelSeven(source);
  assert.deepEqual(result.schedules, []);
  assert.match(result.reason, /materia A.*no tiene grupos/);
  assert.throws(() => validateLevelSevenSelection(source, { courses: [] }), /materia A/);
});

test("valida las referencias y duplicados y reconstruye el profesor antes de guardar", () => {
  for (const professors of [["P1", "P1"], ["P4"], null]) {
    const source = structuredClone(input);
    source.estudiante.materias[0].profesoresPreferidos = professors;
    assert.throws(() => prepareLevelSeven(source), /profesoresPreferidos de la materia A/);
  }
  const wrong = structuredClone(input);
  wrong.catalogo.grupos[0].profesorId = "P4";
  assert.throws(() => prepareLevelSeven(wrong), /profesorId del grupo A2/);
  const choice = { courses: [{ courseId: "A", sectionId: "A0", professor: { id: "P1" } }] };
  assert.throws(() => validateLevelSevenSelection(input, choice), /profesor del grupo A0/);
  choice.courses[0].sectionId = "A2";
  const saved = validateLevelSevenSelection(input, choice);
  assert.equal(saved.professorPreferenceScore, 1);
  assert.deepEqual(saved.courses[0].professor, { id: "P2", name: "Carlos Ruiz" });
});

test("mantiene el mismo orden que filtrar y ordenar completamente en 80 catálogos", () => {
  for (let index = 0; index < 80; index += 1) {
    const source = structuredClone(input);
    const order = index % 2 ? ["P2", "P1"] : ["P1", "P2"];
    source.estudiante.materias[0].profesoresPreferidos = order;
    source.catalogo.materias.push({ id: "B", creditos: 2 });
    source.estudiante.materias.push({
      materiaId: "B",
      prioridad: "alta",
      profesoresPreferidos: order,
    });
    source.catalogo.grupos.push(
      ...source.catalogo.grupos.map((group, groupIndex) => ({
        ...group,
        id: `B${groupIndex}`,
        materiaId: "B",
        cuposDisponibles: (index + groupIndex) % 4 ? 1 : 0,
        sesiones: [{ ...group.sesiones[0], dia: index % 3 ? "martes" : "lunes" }],
      })),
    );
    const groups = new Map(source.catalogo.grupos.map(({ id, profesorId }) => [id, profesorId]));
    const ranked = prepareLevelSix(source)
      .schedules.map((schedule) => ({
        schedule,
        positions: ids(schedule).map((id) => order.indexOf(groups.get(id))),
      }))
      .filter(({ positions }) => positions.every((position) => position >= 0));
    ranked.sort(
      (left, right) =>
        left.positions.reduce((a, b) => a + b, 0) - right.positions.reduce((a, b) => a + b, 0),
    );
    const result = prepareLevelSeven(source, 3);
    assert.deepEqual(
      result.schedules.map(ids),
      ranked.slice(0, 3).map(({ schedule }) => ids(schedule)),
    );
    assert.equal(result.truncated, ranked.length > 3);
  }
});
