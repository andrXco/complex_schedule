import {
  generateLevelFiveSchedules,
  isWithinPreferredWindow,
  type PreferredWindow,
} from "../../domain/scheduling/preferred-window.ts";
import {
  formatGapResult,
  readLevelFourInput,
  validateGapSelection,
  type LevelFourResponse,
} from "./prepare-level-four.ts";
import { asRecord, normalizeTime } from "./schedule-input.ts";

export type LevelFiveResponse = Omit<LevelFourResponse, "level"> & {
  level: 5;
  preferredWindow: PreferredWindow | null;
};

export function readLevelFiveInput(input: unknown) {
  const parsed = readLevelFourInput(input);
  const raw = parsed.student.franja;
  let preferredWindow: PreferredWindow | null = null;
  if (raw !== undefined) {
    const window = asRecord(raw, "estudiante.franja debe ser un objeto.");
    if (Object.keys(window).length > 0) {
      const { inicio, fin } = window;
      const startMinute = normalizeTime(inicio, "estudiante.franja.inicio");
      const endMinute = normalizeTime(fin, "estudiante.franja.fin");
      if (startMinute < 0 || endMinute > 1440 || startMinute >= endMinute) {
        throw new Error(
          "estudiante.franja debe quedar dentro del día y tener inicio anterior al fin.",
        );
      }
      preferredWindow = { startMinute, endMinute };
    }
  }
  return { ...parsed, preferredWindow };
}

export function prepareLevelFive(input: unknown, maxSchedules = 100): LevelFiveResponse {
  const parsed = readLevelFiveInput(input);
  const result = generateLevelFiveSchedules(parsed.courses, parsed, maxSchedules);
  const { preferredWindow } = parsed;
  const requirements = preferredWindow ? ["la franja horaria preferida"] : [];
  return { level: 5, preferredWindow, ...formatGapResult(parsed, result, requirements) };
}

export function validateLevelFiveSelection(input: unknown, selection: unknown) {
  const parsed = readLevelFiveInput(input);
  const result = validateGapSelection(parsed, selection);
  const { preferredWindow } = parsed;
  if (preferredWindow) {
    const conflict = result.courses.find(({ meetings }) =>
      meetings.some((meeting) => !isWithinPreferredWindow(meeting, preferredWindow)),
    );
    if (conflict) {
      throw new Error(
        `El grupo ${conflict.sectionId} de la materia ${conflict.courseId} tiene una sesión fuera de la franja horaria preferida.`,
      );
    }
  }
  return result;
}
