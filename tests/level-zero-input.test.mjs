import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareLevelZero,
  validateLevelZeroSelection,
} from "../src/application/scheduling/prepare-level-zero.ts";

const input = {
  catalogo: {
    grupos: [
      {
        id: "ALG-01",
        materiaId: "ALG",
        cuposDisponibles: 5,
        sesiones: [{ dia: "Lunes", horaInicio: "08:00", horaFin: "09:00" }],
      },
      {
        id: "ALG-02",
        materiaId: "ALG",
        cuposDisponibles: 1,
        sesiones: [{ dia: "Martes", horaInicio: "08:00", horaFin: "09:00" }],
      },
      {
        id: "EST-01",
        materiaId: "EST",
        cuposDisponibles: 2,
        sesiones: [{ dia: "Lunes", horaInicio: "08:30", horaFin: "09:30" }],
      },
      {
        id: "EST-02",
        materiaId: "EST",
        cuposDisponibles: 4,
        sesiones: [{ dia: "Miércoles", horaInicio: "09:00", horaFin: "10:00" }],
      },
    ],
  },
  estudiante: { materias: [{ materiaId: "ALG" }, { materiaId: "EST" }] },
};

test("adapta el JSON del proyecto y descarta secciones cruzadas", () => {
  const result = prepareLevelZero(input);
  assert.equal(result.truncated, false);
  assert.equal(result.schedules.length, 3);
  for (const schedule of result.schedules) {
    assert.equal(schedule.courses.length, 2);
    const meetings = schedule.courses.flatMap((course) => course.meetings);
    for (let left = 0; left < meetings.length; left += 1) {
      for (let right = left + 1; right < meetings.length; right += 1) {
        const a = meetings[left];
        const b = meetings[right];
        assert.ok(a.day !== b.day || a.endMinute <= b.startMinute || b.endMinute <= a.startMinute);
      }
    }
  }
});

test("rechaza datos incompletos y días fuera del calendario soportado", () => {
  assert.throws(() => prepareLevelZero({ catalogo: {}, estudiante: {} }), /catalogo.grupos/);
  assert.throws(
    () =>
      prepareLevelZero({
        catalogo: {
          grupos: [
            {
              id: "G1",
              materiaId: "A",
              cuposDisponibles: 1,
              sesiones: [{ dia: "Domingo", horaInicio: "08:00", horaFin: "09:00" }],
            },
          ],
        },
        estudiante: { materias: [{ materiaId: "A" }] },
      }),
    /Día inválido/,
  );
});

test("omite grupos llenos y devuelve cero horarios si una materia queda sin cupo", () => {
  const catalog = structuredClone(input);
  catalog.catalogo.grupos.find(({ id }) => id === "ALG-02").cuposDisponibles = 0;
  const { schedules } = prepareLevelZero(catalog);
  assert.equal(schedules.length, 1);
  assert.deepEqual(
    schedules[0].courses.map(({ sectionId }) => sectionId),
    ["ALG-01", "EST-02"],
  );

  catalog.catalogo.grupos.find(({ id }) => id === "ALG-01").cuposDisponibles = 0;
  assert.deepEqual(prepareLevelZero(catalog), { schedules: [], truncated: false });
});

test("rechaza cupos ausentes, negativos, fraccionarios o en texto", () => {
  for (const invalid of [undefined, -1, 1.5, "1"]) {
    const catalog = structuredClone(input);
    catalog.catalogo.grupos[0].cuposDisponibles = invalid;
    assert.throws(() => prepareLevelZero(catalog), /cuposDisponibles del grupo ALG-01/);
  }
});

test("al guardar, comprueba cruces usando las sesiones del catálogo y no las del cliente", () => {
  const selection = {
    courses: [
      { courseId: "ALG", sectionId: "ALG-01", meetings: [] },
      { courseId: "EST", sectionId: "EST-01", meetings: [] },
    ],
  };
  assert.throws(() => validateLevelZeroSelection(input, selection), /se cruzan/);

  selection.courses[0].sectionId = "ALG-02";
  const result = validateLevelZeroSelection(input, selection);
  assert.deepEqual(result[0].meetings, [{ day: "2", startMinute: 480, endMinute: 540 }]);

  const catalog = structuredClone(input);
  catalog.catalogo.grupos.find(({ id }) => id === "ALG-02").cuposDisponibles = 0;
  assert.throws(() => validateLevelZeroSelection(catalog, selection), /no tiene cupos/);

  selection.courses[0].sectionId = "EST-02";
  assert.throws(() => validateLevelZeroSelection(input, selection), /no pertenece/);
});

test("al guardar, acepta sesiones contiguas y exige exactamente un grupo por materia", () => {
  const catalog = structuredClone(input);
  catalog.catalogo.grupos.find(({ id }) => id === "EST-01").sesiones[0].horaInicio = "09:00";
  const courses = [
    { courseId: "ALG", sectionId: "ALG-01" },
    { courseId: "EST", sectionId: "EST-01" },
  ];
  assert.equal(validateLevelZeroSelection(catalog, { courses }).length, 2);
  assert.throws(
    () => validateLevelZeroSelection(catalog, { courses: courses.slice(0, 1) }),
    /por cada materia/,
  );
  assert.throws(
    () => validateLevelZeroSelection(catalog, { courses: [courses[0], courses[0]] }),
    /repetida/,
  );
});
