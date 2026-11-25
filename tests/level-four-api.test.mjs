import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = process.env.SCHEDULE_BASE_URL ?? "http://localhost:3000";
const sourceJson = JSON.parse(
  readFileSync(new URL("./selenium/fixtures/huecos.json", import.meta.url), "utf8"),
);

async function post(path, body) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("la API aplica los huecos por defecto y conserva el nivel 3 explícito", async () => {
  const generated = await post("/api/generate", { sourceJson });
  assert.equal(generated.status, 200);
  assert.equal(generated.body.level, 4);
  assert.equal(generated.body.maxGapMinutes, 0);
  assert.deepEqual(
    generated.body.schedules.map(({ courses }) => courses[1].sectionId),
    ["B1"],
  );
  const previous = await post("/api/generate", { sourceJson, level: 3 });
  assert.equal(previous.status, 200);
  assert.equal(previous.body.schedules.length, 2);
});

test("la API rechaza huecos cortos sin máximo y rechaza guardar un hueco excesivo", async () => {
  const malformed = structuredClone(sourceJson);
  malformed.estudiante.huecos = { tipo: "cortos" };
  const validation = await post("/api/generate", { sourceJson: malformed, validateOnly: true });
  assert.equal(validation.status, 400);
  assert.match(validation.body.error, /huecos.maxMinutos/);

  const saved = await post("/api/schedules", {
    ownerUserId: "demo-user-1",
    participantIds: [],
    title: "Prueba de rechazo de nivel 4",
    level: 4,
    sourceJson,
    schedule: {
      courses: [
        { courseId: "A", sectionId: "A1", meetings: [] },
        { courseId: "B", sectionId: "B2", meetings: [] },
      ],
    },
  });
  assert.equal(saved.status, 400);
  assert.match(saved.body.error, /hueco de 30 minutos/);
});
