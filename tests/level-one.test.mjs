import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareLevelOne,
  validateLevelOneSelection,
} from "../src/application/scheduling/prepare-level-one.ts";
import { generateLevelOneSchedules } from "../src/domain/scheduling/level-one.ts";

function group(id, courseId, start, end, day = 1, seats = 1) {
  return {
    id,
    materiaId: courseId,
    cuposDisponibles: seats,
    sesiones: [{ dia: day, inicio: start, fin: end }],
  };
}

function source(requests, groups, limits = {}) {
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

function choices(...pairs) {
  return { courses: pairs.map(([courseId, sectionId]) => ({ courseId, sectionId })) };
}

function ids({ courses }) {
  return courses.map(({ sectionId }) => sectionId);
}

test("informa cada materia alta sin grupos, sin cupos o con sesiones internas cruzadas", () => {
  const overlapping = group("C1", "C", 540, 600);
  overlapping.sesiones.push({ dia: "lunes", inicio: 570, fin: 630 });
  const input = source(
    [
      ["A", "alta", 4],
      ["B", 1, 3],
      ["C", "ALTA", 2],
    ],
    [group("B1", "B", 480, 540, 1, 0), overlapping],
  );
  const result = prepareLevelOne(input);
  assert.equal(result.level, 1);
  assert.deepEqual(result.schedules, []);
  assert.equal(result.truncated, false);
  assert.match(result.reason, /A: sin grupos en el catálogo/);
  assert.match(result.reason, /B: sin grupos con cupos/);
  assert.match(result.reason, /C: .*sesiones que se cruzan/);
});

test("informa conflictos inevitables entre altas y conserva horarios cuando el cruce es con una opcional", () => {
  const requests = [
    ["A", 1, 4],
    ["B", "alta", 3],
  ];
  const groups = [group("A1", "A", 480, 600), group("B1", "B", 540, 660)];
  const blocked = prepareLevelOne(source(requests, groups));
  assert.deepEqual(blocked.schedules, []);
  assert.match(blocked.reason, /materias altas \(A, B\)/);

  requests[1][1] = "media";
  const input = source(requests, groups);
  const { schedules, reason } = prepareLevelOne(input);
  assert.equal(reason, null);
  assert.deepEqual(schedules.map(ids), [["A1"]]);
  assert.match(schedules[0].omitted[0].reasons[0], /se cruzan/);
  const { name, ...selection } = schedules[0];
  assert.deepEqual(validateLevelOneSelection(input, schedules[0]), selection);
});

test("agrega medias y bajas cuando cualquier grupo compatible cabe, incluso en el límite", () => {
  const input = source(
    [
      ["A", 1, 4],
      ["M", 2, 3],
      ["B", 3, 2],
      ["L", "baja", 2],
    ],
    [
      group("A1", "A", 480, 540),
      group("M-LLENO", "M", 540, 600, 1, 0),
      group("M-CRUCE", "M", 510, 570),
      group("M1", "M", 540, 600),
      group("B1", "B", 600, 660),
    ],
    { creditosMax: 9, creditosMin: 9 },
  );
  const result = prepareLevelOne(input);
  assert.equal(result.maxCredits, 9);
  assert.deepEqual(result.schedules.map(ids), [["A1", "M1", "B1"]]);
  assert.equal(result.schedules[0].totalCredits, 9);
  assert.deepEqual(result.schedules[0].omitted, [
    { courseId: "L", reasons: ["sin grupos en el catálogo"] },
  ]);
  assert.throws(() => validateLevelOneSelection(input, choices(["A", "A1"])), /M puede agregarse/);
  assert.throws(
    () => validateLevelOneSelection(input, choices(["A", "A1"], ["M", "M1"])),
    /B puede agregarse/,
  );
});

test("sustituye una baja por una media cuando retirar ese grupo elimina el único cruce", () => {
  const input = source(
    [
      ["A", 1, 4],
      ["M", "media", 3],
      ["B", "baja", 3],
    ],
    [group("A1", "A", 480, 540), group("M1", "M", 540, 600), group("B1", "B", 570, 630)],
    { creditosMax: 7 },
  );
  assert.deepEqual(prepareLevelOne(input).schedules.map(ids), [["A1", "M1"]]);
  const lower = choices(["A", "A1"], ["B", "B1"]);
  assert.throws(
    () => validateLevelOneSelection(input, lower),
    /media M puede sustituir a la baja B/,
  );

  input.catalogo.materias[1].creditos = 4;
  const retained = validateLevelOneSelection(input, lower);
  assert.deepEqual(retained.omitted, [
    {
      courseId: "M",
      reasons: [
        "agregarla supera el máximo de créditos",
        "hay grupos elegibles que se cruzan con sesiones del horario",
      ],
    },
  ]);
  assert.ok(prepareLevelOne(input).schedules.some((schedule) => ids(schedule).includes("B1")));
});

test("una sustitución puede liberar créditos aunque los grupos no se crucen", () => {
  const input = source(
    [
      ["A", 1, 3],
      ["M", 2, 3],
      ["N", 2, 3],
      ["B", 3, 3],
    ],
    [
      group("A1", "A", 480, 540),
      group("M1", "M", 540, 600),
      group("N1", "N", 600, 660),
      group("B1", "B", 660, 720),
    ],
    { creditosMax: 9 },
  );
  assert.throws(
    () => validateLevelOneSelection(input, choices(["A", "A1"], ["M", "M1"], ["B", "B1"])),
    /media N puede sustituir a la baja B/,
  );
  assert.ok(
    prepareLevelOne(input).schedules.some((schedule) => ids(schedule).join() === "A1,M1,N1"),
  );
});

test("conserva opciones localmente maximales aun con distinto número de materias", () => {
  const input = source(
    [
      ["A", 1, 4],
      ["B", 3, 2],
      ["C", 3, 2],
      ["D", 3, 2],
    ],
    [
      group("A1", "A", 480, 540),
      group("B1", "B", 540, 660),
      group("C1", "C", 540, 600),
      group("D1", "D", 600, 660),
    ],
  );
  assert.deepEqual(prepareLevelOne(input).schedules.map(ids), [
    ["A1", "B1"],
    ["A1", "C1", "D1"],
  ]);
});

test("evalúa una sustitución a la vez y mantiene los grupos de las demás materias", () => {
  const input = source(
    [
      ["A", 1, 4],
      ["M", 2, 3],
      ["B", 3, 3],
      ["C", 3, 3],
    ],
    [
      group("A1", "A", 480, 540),
      group("M1", "M", 540, 660),
      group("B1", "B", 540, 600),
      group("B2", "B", 540, 600, 2),
      group("C1", "C", 600, 660),
    ],
  );
  const result = prepareLevelOne(input).schedules.map((schedule) => ids(schedule).join());
  assert.ok(result.includes("A1,B1,C1"));
  assert.ok(result.includes("A1,M1,B2"));
  assert.ok(!result.includes("A1,B2,C1"));
});

test("deja la banda de créditos para el nivel dos y usa el máximo al evaluar cambios", () => {
  const input = source(
    [
      ["A", 1, 4],
      ["M", 2, 4],
      ["B", 3, 3],
    ],
    [group("A1", "A", 480, 540), group("M1", "M", 540, 600), group("B1", "B", 600, 660)],
    { creditosMin: 6, creditosMax: 7 },
  );
  const schedules = prepareLevelOne(input).schedules;
  assert.ok(schedules.some(({ totalCredits }) => totalCredits === 11));
  assert.ok(schedules.some((schedule) => ids(schedule).join() === "A1,B1"));
  assert.ok(!schedules.some((schedule) => ids(schedule).join() === "A1"));
  input.catalogo.grupos.pop();
  assert.ok(prepareLevelOne(input).schedules.some(({ totalCredits }) => totalCredits === 4));
});

test("acepta una selección vacía cuando todas las materias son opcionales y ninguna puede agregarse", () => {
  const input = source([["M", 2, 3]], []);
  const { schedules, truncated } = prepareLevelOne(input, 1);
  assert.equal(truncated, false);
  assert.deepEqual(schedules.map(ids), [[]]);
  assert.equal(validateLevelOneSelection(input, { courses: [] }).totalCredits, 0);
});

test("omite materias opcionales si todos sus grupos están llenos", () => {
  const input = source(
    [
      ["A", "alta", 4],
      ["M", "media", 3],
      ["B", "baja", 2],
    ],
    [
      group("A1", "A", 480, 540),
      group("M1", "M", 540, 600, 1, 0),
      group("B1", "B", 600, 660, 1, 0),
    ],
  );
  const { schedules } = prepareLevelOne(input);
  assert.deepEqual(schedules.map(ids), [["A1"]]);
  assert.deepEqual(schedules[0].omitted, [
    { courseId: "M", reasons: ["sin grupos con cupos disponibles"] },
    { courseId: "B", reasons: ["sin grupos con cupos disponibles"] },
  ]);
});

test("marca truncamiento solo si encuentra otra salida válida y poda omisiones siempre mejorables", () => {
  const requests = Array.from({ length: 36 }, (_, index) => [`A${index}`, 2, 1]);
  const groups = requests.map(([courseId], index) =>
    group(courseId, courseId, index * 30, index * 30 + 30),
  );
  const input = source(requests, groups);
  const unique = prepareLevelOne(input, 1);
  assert.equal(unique.truncated, false);
  assert.equal(unique.schedules[0].courses.length, 36);
  groups.push(group("A0-2", "A0", 0, 30, 2));
  assert.equal(prepareLevelOne(input, 1).truncated, true);
});

test("valida prioridades, créditos, duplicados y referencias al catálogo", () => {
  const input = source([["A", 1, 4]], []);
  for (const value of [undefined, null, "urgente", "1", 4]) {
    const copy = structuredClone(input);
    copy.estudiante.materias[0].prioridad = value;
    assert.throws(() => prepareLevelOne(copy), /prioridad de la materia A/);
  }
  for (const value of [0, -1, 2.1, null, "9"]) {
    const copy = structuredClone(input);
    copy.estudiante.creditosMax = value;
    assert.throws(() => prepareLevelOne(copy), /estudiante.creditosMax/);
    const badCredits = structuredClone(input);
    badCredits.catalogo.materias[0].creditos = value;
    assert.throws(() => prepareLevelOne(badCredits), /creditos de la materia A/);
  }
  input.catalogo.materias.push(input.catalogo.materias[0]);
  assert.throws(() => prepareLevelOne(input), /repetida en el catálogo/);
  input.catalogo.materias = [];
  assert.throws(() => prepareLevelOne(input), /A solicitada no existe/);
  input.catalogo.grupos.push(group("X1", "X", 480, 540));
  assert.throws(() => prepareLevelOne(input), /grupos de la materia X/);
});

test("al guardar reconstruye créditos, razones y sesiones, y rechaza selecciones inválidas", () => {
  const input = source(
    [
      ["A", 1, 4],
      ["B", 2, 3],
    ],
    [
      group("A1", "A", 480, 540),
      group("B-LLENO", "B", 540, 600, 1, 0),
      group("B-CRUCE", "B", 510, 570),
      group("X1", "X", 540, 600),
    ],
  );
  input.catalogo.materias.push({ id: "X", creditos: 2 });
  const valid = choices(["A", "A1"]);
  const saved = validateLevelOneSelection(input, {
    courses: [{ ...valid.courses[0], meetings: [] }],
    totalCredits: 99,
    omitted: [],
  });
  assert.equal(saved.totalCredits, 4);
  assert.equal(saved.omitted[0].courseId, "B");
  assert.deepEqual(saved.courses[0].meetings, [{ day: "1", startMinute: 480, endMinute: 540 }]);
  assert.throws(() => validateLevelOneSelection(input, choices()), /materia alta A/);
  assert.throws(
    () => validateLevelOneSelection(input, choices(["A", "A1"], ["A", "A1"])),
    /repetida/,
  );
  assert.throws(
    () => validateLevelOneSelection(input, choices(["A", "A1"], ["X", "X1"])),
    /no solicitó/,
  );
  assert.throws(
    () => validateLevelOneSelection(input, choices(["A", "A1"], ["B", "B-LLENO"])),
    /no tiene cupos/,
  );
  assert.throws(
    () => validateLevelOneSelection(input, choices(["A", "A1"], ["B", "B-CRUCE"])),
    /se cruzan/,
  );
});

test("coincide con un oráculo exhaustivo en 160 catálogos reproducibles", () => {
  let seed = 0x31bd366;
  function random(max) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 2 ** 32) * max);
  }
  const priorities = ["alta", "media", "baja"];
  for (let index = 0; index < 160; index += 1) {
    const courses = Array.from({ length: 1 + random(5) }, (_, course) => ({
      courseId: `C${course}`,
      priority: priorities[random(priorities.length)],
      credits: 1 + random(4),
      sections: Array.from({ length: random(4) }, (_, section) => ({
        id: `C${course}-${section}`,
        meetings: Array.from({ length: 1 + random(2) }, () => {
          const startMinute = 480 + random(5) * 30;
          return {
            day: String(1 + random(3)),
            startMinute,
            endMinute: startMinute + 30 + random(2) * 30,
          };
        }),
      })),
    }));
    const limit = index % 4 ? 1 + random(14) : Infinity;
    const expected = exhaustive(courses, limit);
    const actual = generateLevelOneSchedules(courses, limit, 5_000);
    assert.equal(actual.truncated, false);
    assert.deepEqual(
      actual.schedules.map(({ assignments }) => signature([...assignments.values()])).sort(),
      expected,
      `catálogo ${index}`,
    );
    const capped = generateLevelOneSchedules(courses, limit, 2);
    assert.equal(capped.schedules.length, Math.min(2, expected.length));
    assert.equal(capped.truncated, expected.length > 2);
  }
});

function exhaustive(courses, limit) {
  const combinations = courses.reduce(
    (partial, { sections }) =>
      partial.flatMap((items) => [null, ...sections].map((section) => [...items, section])),
    [[]],
  );
  function feasible(sections) {
    const sessions = sections.flatMap((section) => section?.meetings ?? []);
    return sessions.every((left, index) =>
      sessions
        .slice(index + 1)
        .every(
          (right) =>
            left.day !== right.day ||
            Math.max(left.startMinute, right.startMinute) >=
              Math.min(left.endMinute, right.endMinute),
        ),
    );
  }
  function fitsCredits(sections) {
    return (
      sections.reduce((sum, section, index) => sum + (section ? courses[index].credits : 0), 0) <=
      limit
    );
  }
  return combinations
    .filter(
      (sections) =>
        feasible(sections) &&
        courses.every(({ priority, sections: candidates }, index) => {
          if (sections[index]) return true;
          if (priority === "alta") return false;
          return candidates.every((candidate) => {
            const extended = sections.map((section, position) =>
              position === index ? candidate : section,
            );
            if (fitsCredits(extended) && feasible(extended)) return false;
            return (
              priority !== "media" ||
              courses.every((course, position) => {
                if (course.priority !== "baja" || !sections[position]) return true;
                const replaced = extended.map((section, other) =>
                  other === position ? null : section,
                );
                return !fitsCredits(replaced) || !feasible(replaced);
              })
            );
          });
        }),
    )
    .map(signature)
    .sort();
}

function signature(sections) {
  return sections
    .filter(Boolean)
    .map(({ id }) => id)
    .join(",");
}
