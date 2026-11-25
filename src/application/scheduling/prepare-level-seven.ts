import type { PrioritizedResult } from "../../domain/scheduling/level-one.ts";
import { generateLevelSevenSchedules } from "../../domain/scheduling/professor-preferences.ts";
import {
  formatDaysOffResult,
  readLevelSixInput,
  validateDaysOffSelection,
  type LevelSixResponse,
} from "./prepare-level-six.ts";
import { asArray, asRecord, readId, type GeneratedSchedule } from "./schedule-input.ts";

export type LevelSevenResponse = Omit<LevelSixResponse, "level"> & {
  level: 7;
  professorPreferences: boolean;
};

export function readLevelSevenInput(input: unknown) {
  const parsed = readLevelSixInput(input);
  const { catalog, requests } = parsed;
  const professors = new Map<string, string>();
  const declared =
    catalog.profesores === undefined
      ? []
      : asArray(catalog.profesores, "catalogo.profesores debe ser una lista.");
  for (const [index, item] of declared.entries()) {
    const label = `catalogo.profesores[${index}]`;
    const professor = asRecord(item, `${label} debe ser un objeto.`);
    const id = readId(professor.id, `${label}.id es obligatorio.`);
    if (professors.has(id))
      throw new Error(`El profesor ${id} está repetido en catalogo.profesores.`);
    if (typeof professor.nombre !== "string" || !professor.nombre.trim()) {
      throw new Error(`${label}.nombre debe ser un texto no vacío.`);
    }
    professors.set(id, professor.nombre.trim());
  }

  const preferences = new Map<string, Map<string, number>>();
  for (const { courseId, preferredProfessors } of requests) {
    if (preferredProfessors === undefined) continue;
    const field = `profesoresPreferidos de la materia ${courseId}`;
    const list = asArray(preferredProfessors, `${field} debe ser una lista.`);
    if (!list.length) continue;
    const ranks = new Map<string, number>();
    for (const [index, value] of list.entries()) {
      const id = readId(value, `${field}[${index}] debe identificar un profesor.`);
      if (!professors.has(id)) throw new Error(`${field} contiene el profesor desconocido ${id}.`);
      if (ranks.has(id)) throw new Error(`${field} contiene el profesor repetido ${id}.`);
      ranks.set(id, index);
    }
    preferences.set(courseId, ranks);
  }

  const professorsBySection = new Map<string, { id: string; name: string }>();
  const sectionRanks = new Map<string, number>();
  const coursesWithPreferredGroup = new Set<string>();
  for (const item of asArray(catalog.grupos, "catalogo.grupos debe ser una lista.")) {
    const group = asRecord(item, "El grupo debe ser un objeto.");
    const sectionId = readId(group.id ?? group.grupoId, "El grupo no tiene id.");
    const courseId = readId(
      group.materiaId ?? group.courseId,
      `El grupo ${sectionId} no tiene materia.`,
    );
    let professorId: string | undefined;
    if (group.profesorId !== undefined) {
      professorId = readId(group.profesorId, `profesorId del grupo ${sectionId} no es válido.`);
      const name = professors.get(professorId);
      if (name === undefined)
        throw new Error(`profesorId del grupo ${sectionId} no existe en catalogo.profesores.`);
      professorsBySection.set(sectionId, { id: professorId, name });
    }
    const ranks = preferences.get(courseId);
    if (!ranks) {
      sectionRanks.set(sectionId, 0);
    } else if (professorId !== undefined) {
      const rank = ranks.get(professorId);
      if (rank !== undefined) {
        sectionRanks.set(sectionId, rank);
        coursesWithPreferredGroup.add(courseId);
      }
    }
  }
  const unmatchedCourse = [...preferences.keys()].find(
    (courseId) => !coursesWithPreferredGroup.has(courseId),
  );
  return {
    ...parsed,
    professorsBySection,
    unmatchedCourse,
    sectionRanks: preferences.size ? sectionRanks : null,
  };
}

type ProfessorInput = ReturnType<typeof readLevelSevenInput>;

export function prepareLevelSeven(input: unknown, maxSchedules = 100): LevelSevenResponse {
  const parsed = readLevelSevenInput(input);
  const result = parsed.unmatchedCourse
    ? { schedules: [], truncated: false, unavailableHigh: [] }
    : generateLevelSevenSchedules(parsed.courses, parsed, maxSchedules);
  return { level: 7, ...formatProfessorResult(parsed, result) };
}

export function formatProfessorResult(
  parsed: ProfessorInput,
  result: PrioritizedResult,
  additionalRequirements: readonly string[] = [],
): Omit<LevelSevenResponse, "level"> {
  const professorPreferences = parsed.sectionRanks !== null;
  const requirements = professorPreferences
    ? ["los profesores preferidos", ...additionalRequirements]
    : additionalRequirements;
  const base = formatDaysOffResult(parsed, result, requirements);
  return {
    ...base,
    reason: parsed.unmatchedCourse
      ? `La materia ${parsed.unmatchedCourse} no tiene grupos con los profesores preferidos.`
      : base.reason,
    professorPreferences,
    schedules: base.schedules.map((schedule) => ({
      ...schedule,
      ...describeProfessors(parsed, schedule.courses),
    })),
  };
}

export function validateLevelSevenSelection(input: unknown, selection: unknown) {
  return validateProfessorSelection(readLevelSevenInput(input), selection);
}

export function validateProfessorSelection(parsed: ProfessorInput, selection: unknown) {
  const result = validateDaysOffSelection(parsed, selection);
  if (parsed.unmatchedCourse) {
    throw new Error(
      `La materia ${parsed.unmatchedCourse} no tiene grupos con los profesores preferidos.`,
    );
  }
  const rejected = result.courses.find(
    ({ sectionId }) => parsed.sectionRanks?.has(sectionId) === false,
  );
  if (rejected) {
    throw new Error(
      `El profesor del grupo ${rejected.sectionId} no está entre los profesores preferidos de la materia ${rejected.courseId}.`,
    );
  }
  return { ...result, ...describeProfessors(parsed, result.courses) };
}

function describeProfessors(parsed: ProfessorInput, courses: GeneratedSchedule["courses"]) {
  return {
    courses: courses.map((course) => {
      const professor = parsed.professorsBySection.get(course.sectionId);
      return professor ? { ...course, professor } : course;
    }),
    professorPreferenceScore: courses.reduce(
      (score, { sectionId }) => score + (parsed.sectionRanks?.get(sectionId) ?? 0),
      0,
    ),
  };
}
