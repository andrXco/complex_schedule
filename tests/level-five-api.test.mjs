import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = process.env.SCHEDULE_BASE_URL ?? "http://localhost:3000";
const sourceJson = JSON.parse(
  readFileSync(new URL("./selenium/fixtures/franja.json", import.meta.url), "utf8"),
);

async function post(path, body) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("la API admite el nivel 5 explícito y conserva el nivel 4", async () => {
  const generated = await post("/api/generate", { sourceJson, level: 5 });
  assert.equal(generated.status, 200);
  assert.equal(generated.body.level, 5);
  assert.deepEqual(generated.body.preferredWindow, { startMinute: 480, endMinute: 960 });
  assert.deepEqual(
    generated.body.schedules.map(({ courses }) => courses.map(({ sectionId }) => sectionId)),
    [["A1", "B1"]],
  );
  const previous = await post("/api/generate", { sourceJson, level: 4 });
  assert.equal(previous.status, 200);
  assert.equal(previous.body.schedules.length, 4);
});

test("la API rechaza una franja inválida y no guarda un grupo fuera de ella", async () => {
  const malformed = structuredClone(sourceJson);
  malformed.estudiante.franja = { inicio: "16:00", fin: "08:00" };
  const validation = await post("/api/generate", { sourceJson: malformed, validateOnly: true });
  assert.equal(validation.status, 400);
  assert.match(validation.body.error, /estudiante.franja/);

  const invalid = await post("/api/schedules", {
    ownerUserId: "demo-user-1",
    participantIds: [],
    title: "Prueba de rechazo de nivel 5",
    level: 5,
    sourceJson,
    schedule: {
      courses: [
        { courseId: "A", sectionId: "A1", meetings: [] },
        { courseId: "B", sectionId: "B0", meetings: [] },
      ],
    },
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /grupo B0.*fuera de la franja/);
});
