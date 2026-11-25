import {
  buildSectionConflictGraph,
  type CourseRequirement,
  type CourseSection,
  type ScheduledMeeting,
} from "./section-conflicts.ts";

export type Priority = "alta" | "media" | "baja";

export type PrioritizedCourse = CourseRequirement & {
  priority: Priority;
  credits: number;
};

type OmissionReason = "no-eligible-section" | "conflict" | "credit-limit";
export type LevelOneOmission = { courseId: string; reasons: OmissionReason[] };

type PriorityIssue =
  | { kind: "missing-high" | "can-add"; courseId: string }
  | { kind: "can-replace"; courseId: string; lowerCourseId: string };

type Evaluation =
  | { valid: true; totalCredits: number; omitted: LevelOneOmission[] }
  | { valid: false; issue: PriorityIssue };

export type PrioritizedResult = {
  schedules: (Extract<Evaluation, { valid: true }> & {
    assignments: Map<string, CourseSection>;
    rank?: number;
  })[];
  truncated: boolean;
  unavailableHigh: string[];
};

type SectionGraph = ReturnType<typeof buildSectionConflictGraph>;

export type SectionSearchOptions = {
  canSelectSection?: (section: CourseSection) => boolean;
  rankSection?: (section: CourseSection) => number;
  acceptsSections?: (sections: readonly CourseSection[]) => boolean;
};

export function generateLevelOneSchedules(
  courses: readonly PrioritizedCourse[],
  maxCredits = Infinity,
  maxSchedules = 100,
): PrioritizedResult {
  return searchPrioritizedSchedules(courses, { maxCredits, maxSchedules });
}

export function generateLevelTwoSchedules(
  courses: readonly PrioritizedCourse[],
  { minCredits, maxCredits }: { minCredits: number; maxCredits: number },
  maxSchedules = 100,
): PrioritizedResult {
  return searchPrioritizedSchedules(courses, { minCredits, maxCredits, maxSchedules });
}

export function searchPrioritizedSchedules(
  courses: readonly PrioritizedCourse[],
  {
    minCredits,
    maxCredits,
    maxSchedules,
    canSelectSection,
    rankSection,
    acceptsMeetings,
    acceptsSections,
  }: SectionSearchOptions & {
    minCredits?: number;
    maxCredits: number;
    maxSchedules: number;
    acceptsMeetings?: (meetings: readonly ScheduledMeeting[]) => boolean;
  },
): PrioritizedResult {
  if (!Number.isInteger(maxSchedules) || maxSchedules < 1) {
    throw new RangeError("maxSchedules must be a positive integer");
  }

  const graph = buildSectionConflictGraph(courses);
  const required = courses.flatMap(({ priority }, index) => (priority === "alta" ? [index] : []));
  const optional = courses.flatMap(({ priority }, index) =>
    priority !== "alta" && graph.nodesByCourse[index].length ? [index] : [],
  );
  const unavailableHigh = required
    .filter((index) => graph.nodesByCourse[index].length === 0)
    .map((index) => courses[index].courseId);
  const result: PrioritizedResult = { schedules: [], truncated: false, unavailableHigh };
  if (unavailableHigh.length) return result;
  const selectable =
    canSelectSection && graph.nodes.map(({ section }) => canSelectSection(section));
  const ranks = rankSection && graph.nodes.map(({ section }) => rankSection(section));
  if (
    selectable &&
    required.some((course) => !graph.nodesByCourse[course].some((node) => selectable[node]))
  ) {
    return result;
  }

  // Establish all required assignments before exploring any optional courses.
  required.sort(
    (left, right) => graph.nodesByCourse[left].length - graph.nodesByCourse[right].length,
  );
  const order = [...required, ...optional];
  const positionByCourse = new Map(order.map((course, position) => [course, position]));
  const lastConflictPosition = graph.conflictGraph.map((neighbors) => {
    let last = -1;
    for (const neighbor of neighbors) {
      last = Math.max(last, positionByCourse.get(graph.nodes[neighbor].courseIndex) ?? -1);
    }
    return last;
  });
  const remainingCredits = Array<number>(order.length + 1).fill(0);
  for (let position = order.length - 1; position >= 0; position -= 1) {
    remainingCredits[position] = remainingCredits[position + 1] + courses[order[position]].credits;
  }
  const selected = new Map<number, number>();

  function search(position: number, totalCredits: number, rank: number): void {
    const last = result.schedules[result.schedules.length - 1];
    // Positions are nonnegative. After finding an extra valid schedule, a later tie cannot improve the output.
    if (ranks && result.truncated && rank >= (last?.rank ?? Infinity)) return;
    // When evaluating level 2, even selecting every remaining course must leave a chance of reaching the range.
    if (
      minCredits !== undefined &&
      (totalCredits > maxCredits || totalCredits + remainingCredits[position] < minCredits)
    ) {
      return;
    }
    if (position === order.length) {
      const evaluation = evaluate(graph, courses, selected, totalCredits, maxCredits);
      if (!evaluation.valid) return;
      if (acceptsSections || acceptsMeetings) {
        const sections = Array.from(selected.values(), (node) => graph.nodes[node].section);
        if (acceptsSections && !acceptsSections(sections)) return;
        if (acceptsMeetings && !acceptsMeetings(sections.flatMap(({ meetings }) => meetings)))
          return;
      }
      if (result.schedules.length === maxSchedules) {
        result.truncated = true;
        if (!ranks || rank >= (last.rank ?? Infinity)) return;
      }
      const assignments = new Map<string, CourseSection>();
      courses.forEach(({ courseId }, index) => {
        const node = selected.get(index);
        if (node !== undefined) assignments.set(courseId, graph.nodes[node].section);
      });
      const entry = { ...evaluation, assignments };
      if (ranks) {
        const position = result.schedules.findIndex((item) => (item.rank ?? Infinity) > rank);
        const ranked = { ...entry, rank };
        if (position === -1) result.schedules.push(ranked);
        else result.schedules.splice(position, 0, ranked);
        if (result.schedules.length > maxSchedules) result.schedules.pop();
      } else {
        result.schedules.push(entry);
      }
      return;
    }

    const course = order[position];
    const selectedNodes = [...selected.values()];
    let alwaysAddable = false;
    for (const node of graph.nodesByCourse[course]) {
      if (selectedNodes.some((other) => graph.conflictGraph[node].has(other))) continue;
      // This section still fits even if every remaining course is selected.
      alwaysAddable ||=
        lastConflictPosition[node] < position &&
        totalCredits + remainingCredits[position] <= maxCredits;
      // Later levels restrict selection after the level 1 addability check.
      if (selectable?.[node] === false) continue;
      selected.set(course, node);
      search(position + 1, totalCredits + courses[course].credits, rank + (ranks?.[node] ?? 0));
      selected.delete(course);
      if (result.truncated && !ranks) return;
    }
    if (position >= required.length && !alwaysAddable) search(position + 1, totalCredits, rank);
  }

  search(0, 0, 0);
  return result;
}

/** The caller has already checked section membership, seats and meeting conflicts. */
export function evaluateLevelOneSelection(
  courses: readonly PrioritizedCourse[],
  assignments: ReadonlyMap<string, CourseSection>,
  maxCredits = Infinity,
): Evaluation {
  const graph = buildSectionConflictGraph(courses);
  const selected = new Map<number, number>();
  let totalCredits = 0;
  courses.forEach(({ courseId, credits }, index) => {
    const section = assignments.get(courseId);
    if (!section) return;
    const node = graph.nodesByCourse[index].find((id) => graph.nodes[id].section.id === section.id);
    if (node === undefined) throw new Error(`El grupo ${section.id} no es elegible.`);
    selected.set(index, node);
    totalCredits += credits;
  });
  return evaluate(graph, courses, selected, totalCredits, maxCredits);
}

function evaluate(
  graph: SectionGraph,
  courses: readonly PrioritizedCourse[],
  selected: ReadonlyMap<number, number>,
  totalCredits: number,
  maxCredits: number,
): Evaluation {
  const missingHigh = courses.find(
    ({ priority }, index) => priority === "alta" && !selected.has(index),
  );
  if (missingHigh) {
    return { valid: false, issue: { kind: "missing-high", courseId: missingHigh.courseId } };
  }

  const omitted: LevelOneOmission[] = [];
  const selectedNodes = [...selected.values()];
  const selectedLow = [...selected.keys()].filter((index) => courses[index].priority === "baja");
  for (const [index, { courseId, priority, credits }] of courses.entries()) {
    if (selected.has(index)) continue;
    const nodes = graph.nodesByCourse[index];
    if (!nodes.length) {
      omitted.push({ courseId, reasons: ["no-eligible-section"] });
      continue;
    }

    const exceedsLimit = totalCredits + credits > maxCredits;
    const reasons: OmissionReason[] = exceedsLimit ? ["credit-limit"] : [];
    let hasConflict = false;
    for (const node of nodes) {
      const conflicts = graph.conflictGraph[node];
      const blockers = selectedNodes.filter((other) => conflicts.has(other));
      hasConflict ||= blockers.length > 0;
      if (!exceedsLimit && blockers.length === 0) {
        return { valid: false, issue: { kind: "can-add", courseId } };
      }
      if (priority !== "media" || blockers.length > 1) continue;
      const replaceable = selectedLow.find(
        (low) =>
          (blockers.length === 0 || blockers[0] === selected.get(low)) &&
          totalCredits - courses[low].credits + credits <= maxCredits,
      );
      if (replaceable !== undefined) {
        return {
          valid: false,
          issue: { kind: "can-replace", courseId, lowerCourseId: courses[replaceable].courseId },
        };
      }
    }
    if (hasConflict) reasons.push("conflict");
    omitted.push({ courseId, reasons });
  }
  return { valid: true, totalCredits, omitted };
}
