import { generateLevelSixSchedules } from "../../domain/scheduling/days-off.ts";
import type { PrioritizedResult } from "../../domain/scheduling/level-one.ts";
import {
  formatPreferredWindowResult,
  readLevelFiveInput,
  validatePreferredWindowSelection,
  type LevelFiveResponse,
} from "./prepare-level-five.ts";
import { asArray, normalizeDay } from "./schedule-input.ts";

export type LevelSixResponse = Omit<LevelFiveResponse, "level"> & {
  level: 6;
  daysOff: string[];
};

export function readLevelSixInput(input: unknown) {
  const parsed = readLevelFiveInput(input);
  const raw = parsed.student.diasLibres;
  const daysOff =
    raw === undefined
      ? []
      : asArray(raw, "estudiante.diasLibres debe ser una lista.").map((day, index) => {
          const label = `estudiante.diasLibres[${index}]`;
          if (typeof day !== "string" && typeof day !== "number") {
            throw new Error(`${label} debe identificar un día.`);
          }
          return normalizeDay(day, label);
        });
  if (new Set(daysOff).size !== daysOff.length) {
    throw new Error("estudiante.diasLibres contiene días repetidos.");
  }
  return { ...parsed, daysOff };
}

export function prepareLevelSix(input: unknown, maxSchedules = 100): LevelSixResponse {
  const parsed = readLevelSixInput(input);
  const result = generateLevelSixSchedules(parsed.courses, parsed, maxSchedules);
  return { level: 6, ...formatDaysOffResult(parsed, result) };
}

export function formatDaysOffResult(
  parsed: ReturnType<typeof readLevelSixInput>,
  result: PrioritizedResult,
  additionalRequirements: readonly string[] = [],
): Omit<LevelSixResponse, "level"> {
  const { daysOff } = parsed;
  const requirements = daysOff.length
    ? ["los días libres solicitados", ...additionalRequirements]
    : additionalRequirements;
  return { daysOff, ...formatPreferredWindowResult(parsed, result, requirements) };
}

export function validateLevelSixSelection(input: unknown, selection: unknown) {
  return validateDaysOffSelection(readLevelSixInput(input), selection);
}

export function validateDaysOffSelection(
  parsed: ReturnType<typeof readLevelSixInput>,
  selection: unknown,
) {
  const result = validatePreferredWindowSelection(parsed, selection);
  const conflict = result.courses.find(({ meetings }) =>
    meetings.some(({ day }) => parsed.daysOff.includes(day)),
  );
  if (conflict) {
    throw new Error(
      `El grupo ${conflict.sectionId} de la materia ${conflict.courseId} tiene una sesión en un día libre.`,
    );
  }
  return result;
}
