import {
  generateLevelThreeSchedules,
  overlapsLunch,
} from "../../domain/scheduling/lunch-window.ts";
import { formatPrioritizedResult } from "./prepare-level-one.ts";
import {
  describeCreditRange,
  readLevelTwoInput,
  validateLevelTwoSelection,
  type LevelTwoResponse,
} from "./prepare-level-two.ts";

export type LevelThreeResponse = Omit<LevelTwoResponse, "level"> & { level: 3 };

export function prepareLevelThree(input: unknown, maxSchedules = 100): LevelThreeResponse {
  const parsed = readLevelTwoInput(input);
  const { minCredits, maxCredits } = parsed;
  const result = generateLevelThreeSchedules(
    parsed.courses,
    { minCredits, maxCredits },
    maxSchedules,
  );
  const creditRequirement =
    minCredits > 0 || Number.isFinite(maxCredits)
      ? `, el requisito de ${describeCreditRange(minCredits, maxCredits)}`
      : "";
  const emptyReason = `No se encontró un horario que respete las prioridades${creditRequirement} y deje libre la ventana de almuerzo de 13:00 a 14:00.`;
  return { level: 3, minCredits, ...formatPrioritizedResult(parsed, result, emptyReason) };
}

export function validateLevelThreeSelection(input: unknown, selection: unknown) {
  const result = validateLevelTwoSelection(input, selection);
  const conflict = result.courses.find(({ meetings }) => meetings.some(overlapsLunch));
  if (conflict) {
    throw new Error(
      `El grupo ${conflict.sectionId} de la materia ${conflict.courseId} cruza la ventana de almuerzo de 13:00 a 14:00.`,
    );
  }
  return result;
}
