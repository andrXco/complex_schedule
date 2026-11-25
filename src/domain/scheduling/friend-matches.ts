import type { PrioritizedCourse } from "./level-one.ts";
import { generateLevelSevenSchedules } from "./professor-preferences.ts";

export function countFriendMatches(
  sectionIds: readonly string[],
  matchesBySection: ReadonlyMap<string, number>,
): number {
  return sectionIds.reduce((total, sectionId) => total + (matchesBySection.get(sectionId) ?? 0), 0);
}

export function generateLevelEightSchedules(
  courses: readonly PrioritizedCourse[],
  constraints: Parameters<typeof generateLevelSevenSchedules>[1] & {
    minFriendMatches: number;
    matchesBySection: ReadonlyMap<string, number>;
  },
  maxSchedules = 100,
) {
  const { minFriendMatches, matchesBySection } = constraints;
  return generateLevelSevenSchedules(
    courses,
    constraints,
    maxSchedules,
    minFriendMatches > 0
      ? (sections) =>
          countFriendMatches(
            sections.map(({ id }) => id),
            matchesBySection,
          ) >= minFriendMatches
      : undefined,
  );
}
