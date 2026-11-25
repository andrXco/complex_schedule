import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const base = process.env.SCHEDULE_BASE_URL ?? "http://localhost:3000";
const sourceJson = JSON.parse(
  await readFile(new URL("../public/horario-ejemplo.json", import.meta.url), "utf8"),
);

async function post(path, body) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("la API genera el nivel 3 por defecto y conserva el nivel 2 explícito", async () => {
  const current = await post("/api/generate", { sourceJson });
  assert.equal(current.status, 200);
  assert.equal(current.body.level, 3);
  assert.equal(current.body.schedules.length, 2);
  for (const { courses, totalCredits } of current.body.schedules) {
    assert.ok(courses.some(({ sectionId }) => sectionId === "SOF-02"));
    assert.equal(totalCredits, 11);
  }
  const previous = await post("/api/generate", { sourceJson, level: 2 });
  assert.equal(previous.status, 200);
  assert.equal(previous.body.schedules.length, 4);
  assert.ok(
    previous.body.schedules.some(({ courses }) =>
      courses.some(({ sectionId }) => sectionId === "SOF-01"),
    ),
  );
});

test("un archivo válido con la única opción en almuerzo devuelve cero horarios", async () => {
  const blocked = structuredClone(sourceJson);
  blocked.catalogo.grupos = blocked.catalogo.grupos.filter(({ id }) => id !== "SOF-02");
  assert.deepEqual(await post("/api/generate", { sourceJson: blocked, validateOnly: true }), {
    status: 200,
    body: { valid: true },
  });
  const result = await post("/api/generate", { sourceJson: blocked });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.schedules, []);
  assert.match(result.body.reason, /almuerzo de 13:00 a 14:00/);
});

test("la API de guardado reconstruye las sesiones y rechaza un grupo en el almuerzo", async () => {
  const result = await post("/api/schedules", {
    ownerUserId: "demo-user-1",
    participantIds: [],
    title: "Prueba de rechazo de nivel 3",
    level: 3,
    sourceJson,
    schedule: {
      courses: [
        { courseId: "ALG", sectionId: "ALG-01", meetings: [] },
        { courseId: "EST", sectionId: "EST-01", meetings: [] },
        { courseId: "SOF", sectionId: "SOF-01", meetings: [] },
      ],
    },
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /grupo SOF-01.*almuerzo de 13:00 a 14:00/);
});
