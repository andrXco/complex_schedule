import {
  countFriendMatches,
  generateLevelEightSchedules,
} from "../../domain/scheduling/friend-matches.ts";
import {
  formatProfessorResult,
  readLevelSevenInput,
  validateProfessorSelection,
  type LevelSevenResponse,
} from "./prepare-level-seven.ts";
import { asArray, asRecord, readId, type GeneratedSchedule } from "./schedule-input.ts";

export type LevelEightResponse = Omit<LevelSevenResponse, "level"> & {
  level: 8;
  minFriendMatches: number;
};

export function readLevelEightInput(input: unknown) {
  const parsed = readLevelSevenInput(input);
  const friends = readStudentIds(parsed.student.amigos, "estudiante.amigos");
  const minimum = parsed.student.minCoincidenciasAmigos;
  if (
    minimum !== undefined &&
    (typeof minimum !== "number" || !Number.isSafeInteger(minimum) || minimum < 0)
  ) {
    throw new Error("estudiante.minCoincidenciasAmigos debe ser un entero mayor o igual que cero.");
  }
  const minFriendMatches = friends.size ? (minimum ?? 0) : 0;
  const matchesBySection = new Map<string, number>();
  for (const item of asArray(parsed.catalog.grupos, "catalogo.grupos debe ser una lista.")) {
    const group = asRecord(item, "El grupo debe ser un objeto.");
    const sectionId = readId(group.id ?? group.grupoId, "El grupo no tiene id.");
    const enrolled = readStudentIds(group.inscritos, `inscritos del grupo ${sectionId}`);
    let matches = 0;
    for (const studentId of enrolled) {
      if (friends.has(studentId)) matches += 1;
    }
    if (matches > 0) matchesBySection.set(sectionId, matches);
  }
  return { ...parsed, minFriendMatches, matchesBySection };
}

export function prepareLevelEight(input: unknown, maxSchedules = 100): LevelEightResponse {
  const parsed = readLevelEightInput(input);
  const { minFriendMatches, matchesBySection } = parsed;
  const result = parsed.unmatchedCourse
    ? { schedules: [], truncated: false, unavailableHigh: [] }
    : generateLevelEightSchedules(parsed.courses, parsed, maxSchedules);
  const requirements = minFriendMatches
    ? [`el mínimo de ${minFriendMatches} coincidencias con amigos`]
    : [];
  const base = formatProfessorResult(parsed, result, requirements);
  return {
    level: 8,
    minFriendMatches,
    ...base,
    schedules: base.schedules.map((schedule) => ({
      ...schedule,
      friendMatches: matchesForSchedule(schedule.courses, matchesBySection),
    })),
  };
}

export function validateLevelEightSelection(input: unknown, selection: unknown) {
  const parsed = readLevelEightInput(input);
  const schedule = validateProfessorSelection(parsed, selection);
  const friendMatches = matchesForSchedule(schedule.courses, parsed.matchesBySection);
  if (friendMatches < parsed.minFriendMatches) {
    throw new Error(
      `El horario tiene ${friendMatches} coincidencias con amigos y el mínimo es ${parsed.minFriendMatches}.`,
    );
  }
  return { ...schedule, friendMatches };
}

function matchesForSchedule(
  courses: GeneratedSchedule["courses"],
  matchesBySection: ReadonlyMap<string, number>,
) {
  return countFriendMatches(
    courses.map(({ sectionId }) => sectionId),
    matchesBySection,
  );
}

function readStudentIds(raw: unknown, field: string): Set<string> {
  const values = raw === undefined ? [] : asArray(raw, `${field} debe ser una lista.`);
  const ids = new Set<string>();
  for (const [index, value] of values.entries()) {
    const id = readId(value, `${field}[${index}] debe identificar un estudiante.`);
    if (ids.has(id)) throw new Error(`${field} contiene el estudiante repetido ${id}.`);
    ids.add(id);
  }
  return ids;
}
