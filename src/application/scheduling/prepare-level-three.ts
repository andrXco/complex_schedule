import {
  generateLevelThreeSchedules,
  overlapsLunch,
} from "../../domain/scheduling/lunch-window.ts";
import type { PrioritizedResult } from "../../domain/scheduling/level-one.ts";
import { formatPrioritizedResult } from "./prepare-level-one.ts";
import {
  describeCreditRange,
  readLevelTwoInput,
  validateCreditSelection,
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
  return { level: 3, ...formatLunchResult(parsed, result) };
}

export function formatLunchResult(
  parsed: ReturnType<typeof readLevelTwoInput>,
  result: PrioritizedResult,
  additionalRequirements: readonly string[] = [],
): Omit<LevelThreeResponse, "level"> {
  const { minCredits, maxCredits } = parsed;
  const requirements = ["las prioridades"];
  if (minCredits > 0 || Number.isFinite(maxCredits)) {
    requirements.push(`el requisito de ${describeCreditRange(minCredits, maxCredits)}`);
  }
  requirements.push("la ventana de almuerzo de 13:00 a 14:00", ...additionalRequirements);
  const last = requirements.pop();
  const emptyReason = `No se encontró un horario que respete ${requirements.join(", ")} y ${last}.`;
  return { minCredits, ...formatPrioritizedResult(parsed, result, emptyReason) };
}

export function validateLevelThreeSelection(input: unknown, selection: unknown) {
  return validateLunchSelection(readLevelTwoInput(input), selection);
}

export function validateLunchSelection(
  parsed: ReturnType<typeof readLevelTwoInput>,
  selection: unknown,
) {
  const result = validateCreditSelection(parsed, selection);
  const conflict = result.courses.find(({ meetings }) => meetings.some(overlapsLunch));
  if (conflict) {
    throw new Error(
      `El grupo ${conflict.sectionId} de la materia ${conflict.courseId} cruza la ventana de almuerzo de 13:00 a 14:00.`,
    );
  }
  return result;
}
