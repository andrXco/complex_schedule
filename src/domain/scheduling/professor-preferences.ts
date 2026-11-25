import { generateLevelSixSchedules } from "./days-off.ts";
import type { PrioritizedCourse } from "./level-one.ts";

export function generateLevelSevenSchedules(
  courses: readonly PrioritizedCourse[],
  constraints: Parameters<typeof generateLevelSixSchedules>[1] & {
    sectionRanks: ReadonlyMap<string, number> | null;
  },
  maxSchedules = 100,
) {
  const { sectionRanks } = constraints;
  return generateLevelSixSchedules(
    courses,
    constraints,
    maxSchedules,
    sectionRanks
      ? {
          canSelectSection: ({ id }) => sectionRanks.has(id),
          rankSection: ({ id }) => sectionRanks.get(id) ?? 0,
        }
      : undefined,
  );
}
