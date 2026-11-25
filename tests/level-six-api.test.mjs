import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = process.env.SCHEDULE_BASE_URL ?? "http://localhost:3000";
const sample = JSON.parse(
  readFileSync(new URL("../public/horario-ejemplo.json", import.meta.url), "utf8"),
);

async function post(path, body) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("la API aplica el día libre al generar y rechaza guardar sesiones de ese día", async () => {
  const sourceJson = structuredClone(sample);
  sourceJson.estudiante.diasLibres = ["viernes"];
  const current = await post("/api/generate", { sourceJson });
  assert.equal(current.status, 200);
  assert.equal(current.body.level, 6);
  assert.deepEqual(current.body.daysOff, ["5"]);
  assert.deepEqual(current.body.schedules, []);
  const previous = await post("/api/generate", { sourceJson, level: 5 });
  assert.equal(previous.status, 200);
  const courses = previous.body.schedules[0].courses.map(({ courseId, sectionId }) => ({
    courseId,
    sectionId,
    meetings: [],
  }));
  const saved = await post("/api/schedules", {
    ownerUserId: "demo-user-1",
    participantIds: [],
    title: "Prueba de rechazo de nivel 6",
    level: 6,
    sourceJson,
    schedule: { courses },
  });
  assert.equal(saved.status, 400);
  assert.match(saved.body.error, /grupo SOF-02.*día libre/);
});
