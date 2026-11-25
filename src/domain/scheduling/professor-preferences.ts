import { generateLevelSixSchedules } from "./days-off.ts";
import type { PrioritizedCourse, SectionSearchOptions } from "./level-one.ts";

export function generateLevelSevenSchedules(
  courses: readonly PrioritizedCourse[],
  constraints: Parameters<typeof generateLevelSixSchedules>[1] & {
    sectionRanks: ReadonlyMap<string, number> | null;
  },
  maxSchedules = 100,
  acceptsSections?: SectionSearchOptions["acceptsSections"],
) {
  const { sectionRanks } = constraints;
  return generateLevelSixSchedules(courses, constraints, maxSchedules, {
    acceptsSections,
    canSelectSection: sectionRanks ? ({ id }) => sectionRanks.has(id) : undefined,
    rankSection: sectionRanks ? ({ id }) => sectionRanks.get(id) ?? 0 : undefined,
  });
}
