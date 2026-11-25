import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = process.env.SCHEDULE_BASE_URL ?? "http://localhost:3000";
const sourceJson = JSON.parse(
  readFileSync(new URL("./selenium/fixtures/amigos.json", import.meta.url), "utf8"),
);

async function post(path, body) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("la API genera el nivel 8 y conserva el nivel 7 explícito", async () => {
  const result = await post("/api/generate", { sourceJson });
  assert.equal(result.status, 200);
  assert.equal(result.body.level, 8);
  assert.equal(result.body.minFriendMatches, 3);
  assert.deepEqual(
    result.body.schedules.map(({ friendMatches }) => friendMatches),
    [3],
  );
  const previous = await post("/api/generate", { sourceJson, level: 7 });
  assert.equal(previous.status, 200);
  assert.equal(previous.body.schedules.length, 4);
});

test("la API rechaza el mínimo inválido y no confía en las coincidencias enviadas al guardar", async () => {
  const malformed = structuredClone(sourceJson);
  malformed.estudiante.minCoincidenciasAmigos = -1;
  const validation = await post("/api/generate", { sourceJson: malformed, validateOnly: true });
  assert.equal(validation.status, 400);
  assert.match(validation.body.error, /estudiante.minCoincidenciasAmigos/);
  const saved = await post("/api/schedules", {
    ownerUserId: "demo-user-1",
    participantIds: [],
    title: "Prueba de rechazo de nivel 8",
    level: 8,
    sourceJson,
    schedule: {
      friendMatches: 99,
      courses: [
        { courseId: "A", sectionId: "A1" },
        { courseId: "B", sectionId: "B1" },
      ],
    },
  });
  assert.equal(saved.status, 400);
  assert.match(saved.body.error, /tiene 2 coincidencias.*mínimo es 3/);
});
