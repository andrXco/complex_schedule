import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const base = process.env.SCHEDULE_BASE_URL ?? "http://localhost:3000";
const source = JSON.parse(
  await readFile(new URL("./selenium/fixtures/prioridades.json", import.meta.url), "utf8"),
);

async function post(path, body) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("la API admite el nivel 2 explícito y filtra los totales por encima del máximo", async () => {
  const sourceJson = structuredClone(source);
  sourceJson.estudiante.creditosMin = 7;
  sourceJson.catalogo.grupos[2].sesiones[0].inicio = "10:00";
  const { status, body } = await post("/api/generate", { sourceJson, level: 2 });
  assert.equal(status, 200);
  assert.equal(body.level, 2);
  assert.equal(body.minCredits, 7);
  assert.equal(body.maxCredits, 7);
  assert.deepEqual(
    body.schedules.map(({ totalCredits }) => totalCredits),
    [7],
  );

  const previous = await post("/api/generate", { sourceJson, level: 1 });
  assert.equal(previous.status, 200);
  assert.ok(previous.body.schedules.some(({ totalCredits }) => totalCredits === 10));
});

test("la API distingue un rango inválido de un mínimo válido que no se alcanza", async () => {
  const sourceJson = structuredClone(source);
  sourceJson.estudiante.creditosMin = 8;
  const invalid = await post("/api/generate", { sourceJson, validateOnly: true, level: 2 });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /creditosMin debe ser menor o igual/);

  sourceJson.estudiante.creditosMax = 9;
  const valid = await post("/api/generate", { sourceJson, validateOnly: true, level: 2 });
  assert.deepEqual(valid, { status: 200, body: { valid: true } });
  const empty = await post("/api/generate", { sourceJson, level: 2 });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.schedules, []);
  assert.match(empty.body.reason, /8 a 9 créditos/);
});

test("la API de guardado rechaza totales fuera del rango aunque se declaren créditos válidos", async () => {
  const high = { courseId: "A", sectionId: "A-01" };
  const medium = { courseId: "M", sectionId: "M-01" };
  const low = { courseId: "B", sectionId: "B-01" };
  const sourceJson = structuredClone(source);
  const common = {
    ownerUserId: "demo-user-1",
    participantIds: [],
    title: "Prueba de rechazo de nivel 2",
    level: 2,
    sourceJson,
  };

  sourceJson.estudiante.creditosMin = 8;
  sourceJson.estudiante.creditosMax = 9;
  const below = await post("/api/schedules", {
    ...common,
    schedule: { courses: [high, medium], totalCredits: 8 },
  });
  assert.equal(below.status, 400);
  assert.match(below.body.error, /suma 7 créditos y el mínimo es 8/);

  sourceJson.catalogo.grupos[2].sesiones[0].inicio = "10:00";
  const above = await post("/api/schedules", {
    ...common,
    schedule: { courses: [high, medium, low], totalCredits: 9 },
  });
  assert.equal(above.status, 400);
  assert.match(above.body.error, /suma 10 créditos y el máximo es 9/);
});
