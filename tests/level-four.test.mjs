import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareLevelThree } from "../src/application/scheduling/prepare-level-three.ts";
import {
  prepareLevelFour,
  validateLevelFourSelection,
} from "../src/application/scheduling/prepare-level-four.ts";
import { findExcessiveGap } from "../src/domain/scheduling/gaps.ts";

const example = JSON.parse(
  readFileSync(new URL("./selenium/fixtures/huecos.json", import.meta.url), "utf8"),
);
const ids = ({ courses }) => courses.map(({ sectionId }) => sectionId);
const meeting = (day, startMinute, endMinute) => ({ day, startMinute, endMinute });

test("descuenta el almuerzo y compara solo sesiones consecutivas del mismo día", () => {
  const sessions = [meeting("2", 900, 960), meeting("1", 870, 930), meeting("1", 720, 780)];
  assert.deepEqual(findExcessiveGap(sessions, 29), { day: "1", minutes: 30 });
  assert.equal(findExcessiveGap(sessions, 30), null);
  assert.equal(findExcessiveGap([meeting("1", 720, 780), meeting("2", 900, 960)], 0), null);
  assert.equal(findExcessiveGap([meeting("1", 720, 780), meeting("1", 840, 900)], 0), null);
});

test("acepta el máximo inclusivo y distingue ningún hueco de la preferencia indiferente", () => {
  const input = structuredClone(example);
  assert.deepEqual(prepareLevelFour(input).schedules.map(ids), [["A1", "B1"]]);
  input.estudiante.huecos = { tipo: "cortos", maxMinutos: 30 };
  const short = prepareLevelFour(input, 1);
  assert.equal(short.maxGapMinutes, 30);
  assert.equal(short.truncated, true);
  assert.deepEqual(prepareLevelFour(input).schedules.map(ids), [
    ["A1", "B1"],
    ["A1", "B2"],
  ]);
  input.estudiante.huecos = { tipo: "cortos", maxMinutos: 29 };
  assert.equal(prepareLevelFour(input, 1).truncated, false);
  for (const indifferent of [{ tipo: "indiferente" }, {}, undefined]) {
    input.estudiante.huecos = indifferent;
    assert.equal(prepareLevelFour(input).maxGapMinutes, null);
    assert.deepEqual(prepareLevelFour(input).schedules, prepareLevelThree(input).schedules);
  }
});

test("permite llenar un hueco de una selección parcial con una materia posterior", () => {
  const input = structuredClone(example);
  input.catalogo.grupos = [
    { ...input.catalogo.grupos[0], sesiones: [{ dia: 1, inicio: 480, fin: 540 }] },
    { ...input.catalogo.grupos[1], sesiones: [{ dia: 1, inicio: 600, fin: 660 }] },
    {
      id: "C1",
      materiaId: "C",
      cuposDisponibles: 1,
      sesiones: [{ dia: 1, inicio: 540, fin: 600 }],
    },
  ];
  input.catalogo.materias.push({ id: "C", creditos: 2 });
  input.estudiante.materias.push({ materiaId: "C", prioridad: "alta" });
  input.estudiante.creditosMax = 9;
  assert.deepEqual(prepareLevelFour(input).schedules.map(ids), [["A1", "B1", "C1"]]);
});

test("detecta huecos entre sesiones de un mismo grupo y reconstruye las sesiones al guardar", () => {
  const input = structuredClone(example);
  const tampered = {
    courses: [
      { courseId: "A", sectionId: "A1", meetings: [] },
      { courseId: "B", sectionId: "B2", meetings: [] },
    ],
  };
  assert.throws(() => validateLevelFourSelection(input, tampered), /hueco de 30 minutos/);
  tampered.courses[1].sectionId = "B1";
  assert.equal(validateLevelFourSelection(input, tampered).totalCredits, 7);
  input.estudiante.materias.pop();
  delete input.estudiante.creditosMin;
  input.catalogo.grupos[0].sesiones.push({ dia: 1, inicio: "14:01", fin: "15:00" });
  assert.deepEqual(prepareLevelFour(input).schedules, []);
  assert.match(prepareLevelFour(input).reason, /cero huecos/);
});

test("valida el modo y exige un entero no negativo para los huecos cortos", () => {
  const input = structuredClone(example);
  for (const huecos of [null, [], "ninguno", { tipo: "largos" }]) {
    input.estudiante.huecos = huecos;
    assert.throws(() => prepareLevelFour(input), /estudiante.huecos/);
  }
  for (const maxMinutos of [undefined, null, -1, 1.5, "30"]) {
    input.estudiante.huecos = { tipo: "cortos", maxMinutos };
    assert.throws(() => prepareLevelFour(input), /estudiante.huecos.maxMinutos/);
  }
  input.estudiante.huecos.maxMinutos = 0;
  assert.equal(prepareLevelFour(input).maxGapMinutes, 0);
});

test("el filtro coincide con una medición minuto a minuto en 80 catálogos", () => {
  for (let offset = 0; offset < 80; offset += 1) {
    const input = structuredClone(example);
    const day = offset % 3 === 0 ? "martes" : "lunes";
    input.catalogo.grupos[1].sesiones = [{ dia: day, inicio: 840 + offset, fin: 880 + offset }];
    input.estudiante.huecos = { tipo: "cortos", maxMinutos: offset % 31 };
    const expected = prepareLevelThree(input).schedules.filter(({ courses }) => {
      const [first, next] = courses.flatMap(({ meetings }) => meetings);
      if (first.day !== next.day) return true;
      let gap = 0;
      for (let minute = first.endMinute; minute < next.startMinute; minute += 1) {
        if (minute < 780 || minute >= 840) gap += 1;
      }
      return gap <= input.estudiante.huecos.maxMinutos;
    });
    const result = prepareLevelFour(input, 1);
    assert.deepEqual(result.schedules.map(ids), expected.slice(0, 1).map(ids));
    assert.equal(result.truncated, expected.length > 1);
  }
});
