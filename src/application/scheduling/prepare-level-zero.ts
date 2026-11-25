import {
  generateLevelZeroSchedules,
  type CourseRequirement,
} from "../../domain/scheduling/level-zero.ts";
import {
  formatAssignments,
  readScheduleInput,
  readScheduleSelection,
  type GeneratedSchedule,
} from "./schedule-input.ts";

export type { GeneratedSchedule } from "./schedule-input.ts";

export type PreparedLevelZero = {
  schedules: GeneratedSchedule[];
  truncated: boolean;
};

/** Maps the project JSON contract into the pure level-zero scheduling domain. */
export function prepareLevelZero(input: unknown, maxSchedules = 100): PreparedLevelZero {
  const courses = readLevelZeroCourses(input);
  const result = generateLevelZeroSchedules(courses, maxSchedules);
  return {
    truncated: result.truncated,
    schedules: result.schedules.map((sections, index) => ({
      name: `Horario ${index + 1}`,
      courses: sections.map((section, sectionIndex) => ({
        courseId: courses[sectionIndex].courseId,
        sectionId: section.id,
        meetings: section.meetings,
      })),
    })),
  };
}

export function readLevelZeroCourses(input: unknown): CourseRequirement[] {
  return readScheduleInput(input).courses;
}

/** Rebuilds the chosen assignment using the source catalog's seats and sessions. */
export function validateLevelZeroSelection(
  input: unknown,
  selection: unknown,
): GeneratedSchedule["courses"] {
  const courses = readLevelZeroCourses(input);
  return formatAssignments(readScheduleSelection(courses, selection, true));
}
