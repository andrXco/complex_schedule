import {
  buildSectionConflictGraph,
  type CourseRequirement,
  type CourseSection,
} from "./section-conflicts.ts";
export {
  findMeetingConflict,
  type CourseRequirement,
  type CourseSection,
  type ScheduledMeeting,
} from "./section-conflicts.ts";

export type LevelZeroResult = {
  schedules: CourseSection[][];
  /** True only when an additional valid schedule exists beyond the requested limit. */
  truncated: boolean;
};

/**
 * Enumerates course-section assignments while keeping the level-zero hard
 * constraint active at every choice. The default cap prevents accidental
 * generation of an unbounded result set; `truncated` reports whether more
 * valid schedules actually exist.
 */
export function generateLevelZeroSchedules(
  courses: readonly CourseRequirement[],
  maxSchedules = 100,
): LevelZeroResult {
  if (!Number.isInteger(maxSchedules) || maxSchedules < 1) {
    throw new RangeError("maxSchedules must be a positive integer");
  }

  const { nodes, nodesByCourse, conflictGraph } = buildSectionConflictGraph(courses);
  const courseDegrees = nodesByCourse.map(
    (nodeIds, courseIndex) =>
      new Set(
        nodeIds.flatMap((nodeId) =>
          [...conflictGraph[nodeId]]
            .map((neighborId) => nodes[neighborId].courseIndex)
            .filter((neighborCourse) => neighborCourse !== courseIndex),
        ),
      ).size,
  );
  const schedules: CourseSection[][] = [];
  const selectedByCourse = new Map<number, number>();
  let truncated = false;

  function search(): void {
    if (truncated) return;

    if (selectedByCourse.size === courses.length) {
      if (schedules.length === maxSchedules) {
        truncated = true;
      } else {
        schedules.push(
          courses.map((_, courseIndex) => nodes[selectedByCourse.get(courseIndex)!].section),
        );
      }
      return;
    }

    const domains = courses.flatMap((_, courseIndex) => {
      if (selectedByCourse.has(courseIndex)) return [];
      const available = nodesByCourse[courseIndex].filter(
        (nodeId) =>
          ![...selectedByCourse.values()].some((selectedNode) =>
            conflictGraph[nodeId].has(selectedNode),
          ),
      );
      return [{ courseIndex, available }];
    });

    if (domains.some(({ available }) => available.length === 0)) return;

    domains.sort(
      (left, right) =>
        left.available.length - right.available.length ||
        courseDegrees[right.courseIndex] - courseDegrees[left.courseIndex] ||
        left.courseIndex - right.courseIndex,
    );
    const { courseIndex, available } = domains[0];
    const remainingNodeIds = domains
      .filter((domain) => domain.courseIndex !== courseIndex)
      .flatMap((domain) => domain.available);
    available.sort(
      (left, right) =>
        countBlockedOptions(left, remainingNodeIds, conflictGraph) -
          countBlockedOptions(right, remainingNodeIds, conflictGraph) || left - right,
    );

    for (const nodeId of available) {
      selectedByCourse.set(courseIndex, nodeId);
      search();
      selectedByCourse.delete(courseIndex);
      if (truncated) return;
    }
  }

  search();
  return { schedules, truncated };
}

function countBlockedOptions(
  nodeId: number,
  remainingNodeIds: readonly number[],
  conflictGraph: readonly Set<number>[],
): number {
  return remainingNodeIds.reduce(
    (blocked, otherNodeId) => blocked + Number(conflictGraph[nodeId].has(otherNodeId)),
    0,
  );
}
