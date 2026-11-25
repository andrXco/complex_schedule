import { generateLevelFourSchedules } from "./gaps.ts";
import type { PrioritizedCourse } from "./level-one.ts";
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
) {
  const { preferredWindow } = constraints;
  return generateLevelFourSchedules(
    courses,
    constraints,
    maxSchedules,
    preferredWindow
      ? ({ meetings }) =>
          meetings.every((meeting) => isWithinPreferredWindow(meeting, preferredWindow))
      : undefined,
  );
}
