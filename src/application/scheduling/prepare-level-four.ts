import { findExcessiveGap, generateLevelFourSchedules } from "../../domain/scheduling/gaps.ts";
import type { PrioritizedResult } from "../../domain/scheduling/level-one.ts";
import { readLevelTwoInput } from "./prepare-level-two.ts";
import {
  formatLunchResult,
  validateLunchSelection,
  type LevelThreeResponse,
} from "./prepare-level-three.ts";
import { asRecord } from "./schedule-input.ts";

export type LevelFourResponse = Omit<LevelThreeResponse, "level"> & {
  level: 4;
  maxGapMinutes: number | null;
};

export function readLevelFourInput(input: unknown) {
  const parsed = readLevelTwoInput(input);
  const raw = parsed.student.huecos;
  if (raw === undefined) return { ...parsed, maxGapMinutes: null };

  const { tipo = "indiferente", maxMinutos } = asRecord(
    raw,
    "estudiante.huecos debe ser un objeto.",
  );
  if (tipo !== "indiferente" && tipo !== "ninguno" && tipo !== "cortos") {
    throw new Error("estudiante.huecos.tipo debe ser indiferente, ninguno o cortos.");
  }
  if (
    (tipo === "cortos" || maxMinutos !== undefined) &&
    (typeof maxMinutos !== "number" || !Number.isSafeInteger(maxMinutos) || maxMinutos < 0)
  ) {
    throw new Error("estudiante.huecos.maxMinutos debe ser un entero mayor o igual que cero.");
  }
  const maxGapMinutes = tipo === "ninguno" ? 0 : tipo === "cortos" ? Number(maxMinutos) : null;
  return { ...parsed, maxGapMinutes };
}

export function prepareLevelFour(input: unknown, maxSchedules = 100): LevelFourResponse {
  const parsed = readLevelFourInput(input);
  const result = generateLevelFourSchedules(parsed.courses, parsed, maxSchedules);
  return { level: 4, ...formatGapResult(parsed, result) };
}

export function formatGapResult(
  parsed: ReturnType<typeof readLevelFourInput>,
  result: PrioritizedResult,
  additionalRequirements: readonly string[] = [],
): Omit<LevelFourResponse, "level"> {
  const { maxGapMinutes } = parsed;
  const requirements = [...additionalRequirements];
  if (maxGapMinutes !== null) {
    requirements.unshift(
      maxGapMinutes === 0
        ? "el requisito de cero huecos"
        : `el máximo de ${maxGapMinutes} minutos por hueco`,
    );
  }
  return { maxGapMinutes, ...formatLunchResult(parsed, result, requirements) };
}

export function validateLevelFourSelection(input: unknown, selection: unknown) {
  return validateGapSelection(readLevelFourInput(input), selection);
}

export function validateGapSelection(
  parsed: ReturnType<typeof readLevelFourInput>,
  selection: unknown,
) {
  const result = validateLunchSelection(parsed, selection);
  const { maxGapMinutes } = parsed;
  if (maxGapMinutes !== null) {
    const gap = findExcessiveGap(
      result.courses.flatMap(({ meetings }) => meetings),
      maxGapMinutes,
    );
    if (gap)
      throw new Error(
        `El horario tiene un hueco de ${gap.minutes} minutos y el máximo es ${maxGapMinutes}.`,
      );
  }
  return result;
}
