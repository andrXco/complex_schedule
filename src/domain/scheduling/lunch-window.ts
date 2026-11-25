import { searchPrioritizedSchedules, type PrioritizedCourse } from "./level-one.ts";
import type { ScheduledMeeting } from "./section-conflicts.ts";

export const lunchWindow = { startMinute: 13 * 60, endMinute: 14 * 60 } as const;

export function overlapsLunch({ startMinute, endMinute }: ScheduledMeeting): boolean {
  return startMinute < lunchWindow.endMinute && lunchWindow.startMinute < endMinute;
}

export function generateLevelThreeSchedules(
  courses: readonly PrioritizedCourse[],
  { minCredits, maxCredits }: { minCredits: number; maxCredits: number },
  maxSchedules = 100,
) {
  return searchPrioritizedSchedules(courses, {
    minCredits,
    maxCredits,
    maxSchedules,
    canSelectSection: ({ meetings }) => !meetings.some(overlapsLunch),
  });
}
