import { generateLevelTwoSchedules } from "../../domain/scheduling/level-one.ts";
import {
  formatPrioritizedResult,
  readCreditLimit,
  readLevelOneInput,
  validatePrioritizedSelection,
  type LevelOneResponse,
} from "./prepare-level-one.ts";

export type LevelTwoResponse = Omit<LevelOneResponse, "level"> & {
  level: 2;
  minCredits: number;
};

export function readLevelTwoInput(input: unknown) {
  const parsed = readLevelOneInput(input);
  const minCredits = readCreditLimit(parsed.student.creditosMin, "creditosMin") ?? 0;
  if (minCredits > parsed.maxCredits) {
    throw new Error("estudiante.creditosMin debe ser menor o igual que estudiante.creditosMax.");
  }
  return { ...parsed, minCredits };
}

export function prepareLevelTwo(input: unknown, maxSchedules = 100): LevelTwoResponse {
  const parsed = readLevelTwoInput(input);
  const { minCredits, maxCredits } = parsed;
  const result = generateLevelTwoSchedules(
    parsed.courses,
    { minCredits, maxCredits },
    maxSchedules,
  );
  const emptyReason =
    minCredits > 0 || Number.isFinite(maxCredits)
      ? `No se encontró un horario que cumpla las prioridades y el requisito de ${describeCreditRange(minCredits, maxCredits)}.`
      : undefined;
  return { level: 2, minCredits, ...formatPrioritizedResult(parsed, result, emptyReason) };
}

export function validateLevelTwoSelection(input: unknown, selection: unknown) {
  return validateCreditSelection(readLevelTwoInput(input), selection);
}

export function validateCreditSelection(
  parsed: ReturnType<typeof readLevelTwoInput>,
  selection: unknown,
) {
  const result = validatePrioritizedSelection(parsed, selection);
  const { totalCredits } = result;
  if (totalCredits < parsed.minCredits) {
    throw new Error(
      `El horario suma ${totalCredits} créditos y el mínimo es ${parsed.minCredits}.`,
    );
  }
  if (totalCredits > parsed.maxCredits) {
    throw new Error(
      `El horario suma ${totalCredits} créditos y el máximo es ${parsed.maxCredits}.`,
    );
  }
  return result;
}

export function describeCreditRange(minCredits: number, maxCredits: number): string {
  if (!Number.isFinite(maxCredits)) return `al menos ${minCredits} créditos`;
  if (minCredits === 0) return `hasta ${maxCredits} créditos`;
  if (minCredits === maxCredits) return `${minCredits} créditos exactos`;
  return `${minCredits} a ${maxCredits} créditos`;
}
