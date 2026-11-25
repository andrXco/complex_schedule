import { generateLevelFiveSchedules } from "./preferred-window.ts";
import type { PrioritizedCourse } from "./level-one.ts";

export function generateLevelSixSchedules(
  courses: readonly PrioritizedCourse[],
  constraints: Parameters<typeof generateLevelFiveSchedules>[1] & { daysOff: readonly string[] },
  maxSchedules = 100,
) {
  const daysOff = new Set(constraints.daysOff);
  return generateLevelFiveSchedules(
    courses,
    constraints,
    maxSchedules,
    daysOff.size ? ({ meetings }) => meetings.every(({ day }) => !daysOff.has(day)) : undefined,
  );
}
