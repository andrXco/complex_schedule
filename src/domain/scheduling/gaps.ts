import {
  searchPrioritizedSchedules,
  type PrioritizedCourse,
  type SectionSearchOptions,
} from "./level-one.ts";
import { isOutsideLunch, lunchWindow } from "./lunch-window.ts";
import type { ScheduledMeeting } from "./section-conflicts.ts";

export function findExcessiveGap(meetings: readonly ScheduledMeeting[], maxMinutes: number) {
  const ordered = [...meetings].sort(
    (left, right) => left.day.localeCompare(right.day) || left.startMinute - right.startMinute,
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const next = ordered[index];
    if (previous.day !== next.day) continue;

    const start = previous.endMinute;
    const end = next.startMinute;
    const lunchMinutes = Math.max(
      0,
      Math.min(end, lunchWindow.endMinute) - Math.max(start, lunchWindow.startMinute),
    );
    const minutes = end - start - lunchMinutes;
    if (minutes > maxMinutes) return { day: next.day, minutes };
  }
  return null;
}

export function generateLevelFourSchedules(
  courses: readonly PrioritizedCourse[],
  {
    minCredits,
    maxCredits,
    maxGapMinutes,
  }: {
    minCredits: number;
    maxCredits: number;
    maxGapMinutes: number | null;
  },
  maxSchedules = 100,
  options: SectionSearchOptions = {},
) {
  const { canSelectSection } = options;
  return searchPrioritizedSchedules(courses, {
    ...options,
    minCredits,
    maxCredits,
    maxSchedules,
    canSelectSection: canSelectSection
      ? (section) => isOutsideLunch(section) && canSelectSection(section)
      : isOutsideLunch,
    acceptsMeetings:
      maxGapMinutes === null ? undefined : (meetings) => !findExcessiveGap(meetings, maxGapMinutes),
  });
}
