import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareLevelSeven } from "../src/application/scheduling/prepare-level-seven.ts";
import {
  prepareLevelEight,
  validateLevelEightSelection,
} from "../src/application/scheduling/prepare-level-eight.ts";

const input = JSON.parse(
  readFileSync(new URL("./selenium/fixtures/amigos.json", import.meta.url), "utf8"),
);
const ids = ({ courses }) => courses.map(({ sectionId }) => sectionId);

test("cuenta por pareja amigo y materia aunque haya varias sesiones y otros inscritos", () => {
  const result = prepareLevelEight(input, 1);
  assert.equal(result.level, 8);
  assert.equal(result.minFriendMatches, 3);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.schedules.map(ids), [["A2", "B1"]]);
  assert.equal(result.schedules[0].friendMatches, 3);
  assert.equal(result.schedules[0].professorPreferenceScore, 1);
});

test("mantiene el orden de profesores y trunca solo en horarios que alcanzan el mínimo", () => {
  const source = structuredClone(input);
  source.estudiante.minCoincidenciasAmigos = 2;
  const full = prepareLevelEight(source);
  assert.deepEqual(full.schedules.map(ids), [
    ["A1", "B1"],
    ["A2", "B1"],
    ["A2", "B2"],
  ]);
  assert.deepEqual(
    full.schedules.map(({ friendMatches }) => friendMatches),
    [2, 3, 2],
  );
  const capped = prepareLevelEight(source, 1);
  assert.deepEqual(capped.schedules.map(ids), [["A1", "B1"]]);
  assert.equal(capped.truncated, true);
});

test("la ausencia de amigos, la ausencia del mínimo y un mínimo cero dejan neutro el filtro", () => {
  for (const override of [
    { amigos: [] },
    { amigos: undefined },
    { minCoincidenciasAmigos: 0 },
    { minCoincidenciasAmigos: undefined },
  ]) {
    const source = structuredClone(input);
    Object.assign(source.estudiante, override);
    const result = prepareLevelEight(source, 2);
    const previous = prepareLevelSeven(source, 2);
    assert.equal(result.minFriendMatches, 0);
    assert.deepEqual(result.schedules.map(ids), previous.schedules.map(ids));
    assert.equal(result.truncated, previous.truncated);
  }
});

test("informa un mínimo inalcanzable y admite grupos antiguos sin inscritos", () => {
  const source = structuredClone(input);
  for (const group of source.catalogo.grupos) delete group.inscritos;
  const result = prepareLevelEight(source);
  assert.deepEqual(result.schedules, []);
  assert.match(result.reason, /mínimo de 3 coincidencias con amigos/);
  source.estudiante.minCoincidenciasAmigos = 0;
  assert.ok(prepareLevelEight(source).schedules.every(({ friendMatches }) => friendMatches === 0));
});

test("rechaza listas y mínimos inválidos, incluidos los duplicados tras normalizar ids", () => {
  for (const amigos of [null, "F1", [1, "1"], [""], [{}]]) {
    const source = structuredClone(input);
    source.estudiante.amigos = amigos;
    assert.throws(() => prepareLevelEight(source), /estudiante.amigos/);
  }
  for (const minCoincidenciasAmigos of [null, -1, 1.5, "3"]) {
    const source = structuredClone(input);
    source.estudiante.minCoincidenciasAmigos = minCoincidenciasAmigos;
    assert.throws(() => prepareLevelEight(source), /estudiante.minCoincidenciasAmigos/);
  }
  const source = structuredClone(input);
  source.catalogo.grupos[0].inscritos = ["F1", " F1 "];
  assert.throws(() => prepareLevelEight(source), /inscritos del grupo A1/);
});

test("recalcula las coincidencias al guardar y conserva las reglas acumuladas", () => {
  const selection = {
    friendMatches: 99,
    courses: [
      { courseId: "A", sectionId: "A1" },
      { courseId: "B", sectionId: "B1" },
    ],
  };
  assert.throws(
    () => validateLevelEightSelection(input, selection),
    /tiene 2 coincidencias.*mínimo es 3/,
  );
  selection.courses[0].sectionId = "A2";
  const saved = validateLevelEightSelection(input, selection);
  assert.equal(saved.friendMatches, 3);
  assert.equal(saved.professorPreferenceScore, 1);
  const blocked = structuredClone(input);
  blocked.estudiante.diasLibres = ["jueves"];
  assert.deepEqual(prepareLevelEight(blocked).schedules, []);
  assert.throws(() => validateLevelEightSelection(blocked, selection), /día libre/);
});

test("coincide con el filtrado completo del nivel 7 en 80 catálogos antes del límite", () => {
  for (let index = 0; index < 80; index += 1) {
    const source = structuredClone(input);
    source.catalogo.grupos.forEach((group, position) => {
      group.inscritos = ["F1", "F2", "E3"].filter((_, id) => ((index + position) >> id) & 1);
    });
    source.estudiante.minCoincidenciasAmigos = index % 5;
    if (index % 2) source.estudiante.materias[0].profesoresPreferidos.reverse();
    const enrolled = new Map(source.catalogo.grupos.map(({ id, inscritos }) => [id, inscritos]));
    const expected = prepareLevelSeven(source)
      .schedules.map((schedule) => ({
        schedule,
        count: ids(schedule)
          .flatMap((id) => enrolled.get(id))
          .filter((id) => id === "F1" || id === "F2").length,
      }))
      .filter(({ count }) => count >= source.estudiante.minCoincidenciasAmigos);
    const result = prepareLevelEight(source, 2);
    assert.deepEqual(
      result.schedules.map(ids),
      expected.slice(0, 2).map(({ schedule }) => ids(schedule)),
    );
    assert.deepEqual(
      result.schedules.map(({ friendMatches }) => friendMatches),
      expected.slice(0, 2).map(({ count }) => count),
    );
    assert.equal(result.truncated, expected.length > 2);
  }
});
