/** A class meeting uses a canonical day key and minutes since midnight. */
export type ScheduledMeeting = {
  day: string;
  startMinute: number;
  endMinute: number;
};

/** A section is one selectable group for a course. */
export type CourseSection = {
  id: string;
  meetings: ScheduledMeeting[];
};

export type CourseRequirement = {
  courseId: string;
  sections: CourseSection[];
};

/**
 * Returns a witness pair when two meetings occupy the same day and overlap.
 * Intervals are half-open: a class ending at 10:00 does not overlap one starting
 * at 10:00.
 */
export function findMeetingConflict(
  meetings: readonly ScheduledMeeting[],
): [ScheduledMeeting, ScheduledMeeting] | null {
  const ordered = [...meetings].sort(
    (left, right) =>
      left.day.localeCompare(right.day) ||
      left.startMinute - right.startMinute ||
      left.endMinute - right.endMinute,
  );

  let latestEnding: ScheduledMeeting | undefined;
  for (const meeting of ordered) {
    validateMeeting(meeting);

    if (latestEnding?.day === meeting.day && meeting.startMinute < latestEnding.endMinute) {
      return [latestEnding, meeting];
    }

    if (
      !latestEnding ||
      latestEnding.day !== meeting.day ||
      meeting.endMinute > latestEnding.endMinute
    ) {
      latestEnding = meeting;
    }
  }

  return null;
}

export function buildSectionConflictGraph(courses: readonly CourseRequirement[]) {
  const nodes: { courseIndex: number; section: CourseSection }[] = [];
  const nodesByCourse = courses.map((course, courseIndex) =>
    course.sections.flatMap((section) => {
      for (const meeting of section.meetings) validateMeeting(meeting);
      if (findMeetingConflict(section.meetings)) return [];

      const nodeId = nodes.length;
      nodes.push({ courseIndex, section });
      return [nodeId];
    }),
  );
  const conflictGraph = nodes.map(() => new Set<number>());

  for (let leftCourse = 0; leftCourse < nodesByCourse.length; leftCourse += 1) {
    for (let rightCourse = leftCourse + 1; rightCourse < nodesByCourse.length; rightCourse += 1) {
      for (const leftNode of nodesByCourse[leftCourse]) {
        for (const rightNode of nodesByCourse[rightCourse]) {
          if (
            !findMeetingConflict([
              ...nodes[leftNode].section.meetings,
              ...nodes[rightNode].section.meetings,
            ])
          )
            continue;
          conflictGraph[leftNode].add(rightNode);
          conflictGraph[rightNode].add(leftNode);
        }
      }
    }
  }

  return { nodes, nodesByCourse, conflictGraph };
}

function validateMeeting(meeting: ScheduledMeeting): void {
  if (!meeting.day.trim()) {
    throw new RangeError("Each meeting must have a non-empty canonical day");
  }
  if (
    !Number.isInteger(meeting.startMinute) ||
    !Number.isInteger(meeting.endMinute) ||
    meeting.startMinute < 0 ||
    meeting.endMinute > 24 * 60 ||
    meeting.startMinute >= meeting.endMinute
  ) {
    throw new RangeError("Meeting times must be valid minute offsets with start before end");
  }
}
