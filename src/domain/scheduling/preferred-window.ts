import { generateLevelFourSchedules } from "./gaps.ts";
import type { PrioritizedCourse, SectionSearchOptions } from "./level-one.ts";
import type { ScheduledMeeting } from "./section-conflicts.ts";

export type PreferredWindow = Pick<ScheduledMeeting, "startMinute" | "endMinute">;

export function isWithinPreferredWindow(
  meeting: ScheduledMeeting,
  window: PreferredWindow,
): boolean {
  return meeting.startMinute >= window.startMinute && meeting.endMinute <= window.endMinute;
}

export function generateLevelFiveSchedules(
  courses: readonly PrioritizedCourse[],
  constraints: Parameters<typeof generateLevelFourSchedules>[1] & {
    preferredWindow: PreferredWindow | null;
  },
  maxSchedules = 100,
  options: SectionSearchOptions = {},
) {
  const { preferredWindow } = constraints;
  return generateLevelFourSchedules(courses, constraints, maxSchedules, {
    ...options,
    canSelectSection: preferredWindow
      ? (section) =>
          section.meetings.every((meeting) => isWithinPreferredWindow(meeting, preferredWindow)) &&
          (options.canSelectSection?.(section) ?? true)
      : options.canSelectSection,
  });
}
