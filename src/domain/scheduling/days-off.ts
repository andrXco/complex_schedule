import { generateLevelFiveSchedules } from "./preferred-window.ts";
import type { PrioritizedCourse, SectionSearchOptions } from "./level-one.ts";

export function generateLevelSixSchedules(
  courses: readonly PrioritizedCourse[],
  constraints: Parameters<typeof generateLevelFiveSchedules>[1] & { daysOff: readonly string[] },
  maxSchedules = 100,
  options: SectionSearchOptions = {},
) {
  const daysOff = new Set(constraints.daysOff);
  return generateLevelFiveSchedules(courses, constraints, maxSchedules, {
    ...options,
    canSelectSection: daysOff.size
      ? (section) =>
          section.meetings.every(({ day }) => !daysOff.has(day)) &&
          (options.canSelectSection?.(section) ?? true)
      : options.canSelectSection,
  });
}
