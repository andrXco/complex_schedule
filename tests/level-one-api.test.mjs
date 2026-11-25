import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const base = process.env.SCHEDULE_BASE_URL ?? "http://localhost:3000";
const sourceJson = JSON.parse(
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

test("la ruta conserva validación y ejecución explícitas de los niveles 0 y 1", async () => {
  assert.deepEqual(await post("/api/generate", { sourceJson, validateOnly: true, level: 1 }), {
    status: 200,
    body: { valid: true },
  });
  const generated = await post("/api/generate", { sourceJson, level: 1 });
  assert.equal(generated.status, 200);
  assert.equal(generated.body.level, 1);
  assert.equal(generated.body.maxCredits, 7);
  assert.equal(generated.body.schedules.length, 1);
  assert.deepEqual(
    generated.body.schedules[0].courses.map(({ sectionId }) => sectionId),
    ["A-01", "M-01"],
  );
  assert.equal(generated.body.schedules[0].omitted[0].courseId, "B");
  const legacy = await post("/api/generate", { sourceJson, level: 0 });
  assert.deepEqual(legacy, { status: 200, body: { level: 0, schedules: [], truncated: false } });
});

test("distingue un archivo inválido de una instancia válida sin horario", async () => {
  const unavailable = structuredClone(sourceJson);
  unavailable.catalogo.grupos[0].cuposDisponibles = 0;
  const generated = await post("/api/generate", { sourceJson: unavailable, level: 1 });
  assert.equal(generated.status, 200);
  assert.deepEqual(generated.body.schedules, []);
  assert.match(generated.body.reason, /Materia alta A: sin grupos con cupos/);
  delete unavailable.estudiante.materias[0].prioridad;
  const invalid = await post("/api/generate", {
    sourceJson: unavailable,
    validateOnly: true,
    level: 1,
  });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /prioridad de la materia A/);
  assert.equal((await post("/api/generate", { sourceJson, level: 3 })).status, 400);
});

test("POST de guardado rechaza altas omitidas, adiciones, sustituciones y cruces", async () => {
  const high = { courseId: "A", sectionId: "A-01" };
  const medium = { courseId: "M", sectionId: "M-01" };
  const low = { courseId: "B", sectionId: "B-01" };
  for (const [courses, error] of [
    [[medium], /materia alta A/],
    [[high], /M puede agregarse/],
    [[high, low], /media M puede sustituir a la baja B/],
    [[high, medium, low], /se cruzan/],
  ]) {
    const invalid = await post("/api/schedules", {
      ownerUserId: "demo-user-1",
      participantIds: [],
      title: "Prueba de rechazo de nivel 1",
      level: 1,
      schedule: { courses },
      sourceJson,
    });
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.error, error);
  }
});

test("los horarios anteriores de nivel 0 conservan sus grupos al consultarlos", async () => {
  const response = await fetch(new URL("/api/schedules?userId=demo-user-2", base));
  assert.equal(response.status, 200);
  const { schedules } = await response.json();
  const shared = schedules.find(({ title }) => title === "Horario compartido de prueba");
  assert.equal(shared?.level, 0);
  assert.deepEqual(
    shared.schedule.courses.map(({ sectionId }) => sectionId),
    ["A2", "E2"],
  );
});
