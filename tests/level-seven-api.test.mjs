import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = process.env.SCHEDULE_BASE_URL ?? "http://localhost:3000";
const sourceJson = JSON.parse(
  readFileSync(new URL("./selenium/fixtures/profesores.json", import.meta.url), "utf8"),
);

async function post(path, body) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("la API ordena por profesores preferidos y rechaza guardar un docente ajeno a la lista", async () => {
  const generated = await post("/api/generate", { sourceJson, level: 7 });
  assert.equal(generated.status, 200);
  assert.equal(generated.body.level, 7);
  assert.deepEqual(
    generated.body.schedules.map(({ courses }) => courses[0].sectionId),
    ["A1", "A3", "A2"],
  );
  const saved = await post("/api/schedules", {
    ownerUserId: "demo-user-1",
    participantIds: [],
    title: "Prueba de rechazo de nivel 7",
    level: 7,
    sourceJson,
    schedule: { courses: [{ courseId: "A", sectionId: "A0", professor: { id: "P1" } }] },
  });
  assert.equal(saved.status, 400);
  assert.match(saved.body.error, /profesor del grupo A0/);
});
