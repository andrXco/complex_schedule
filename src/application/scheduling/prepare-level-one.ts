import {
  evaluateLevelOneSelection,
  generateLevelOneSchedules,
  type LevelOneOmission,
  type PrioritizedCourse,
  type PrioritizedResult,
  type Priority,
} from "../../domain/scheduling/level-one.ts";
import {
  asArray,
  asRecord,
  formatAssignments,
  readId,
  readScheduleInput,
  readScheduleSelection,
  type GeneratedSchedule,
} from "./schedule-input.ts";

type PrioritizedSchedule = GeneratedSchedule &
  Required<Pick<GeneratedSchedule, "omitted" | "totalCredits">>;

export type LevelOneResponse = {
  level: 1;
  schedules: PrioritizedSchedule[];
  truncated: boolean;
  reason: string | null;
  maxCredits: number | null;
};

type LevelOneInput = ReturnType<typeof readLevelOneInput>;

export function readLevelOneInput(input: unknown) {
  const { catalog, student, requests, courses, coursesWithGroups } = readScheduleInput(input);
  const maxCredits = readCreditLimit(student.creditosMax, "creditosMax") ?? Infinity;

  const catalogCourses = asArray(catalog.materias, "catalogo.materias debe ser una lista");
  const creditsByCourse = new Map<string, number>();
  for (const [index, entry] of catalogCourses.entries()) {
    const course = asRecord(entry, `catalogo.materias[${index}] no es una materia válida.`);
    const id = readId(course.id, `catalogo.materias[${index}].id es obligatorio.`);
    if (creditsByCourse.has(id)) throw new Error(`La materia ${id} está repetida en el catálogo.`);
    if (
      typeof course.creditos !== "number" ||
      !Number.isSafeInteger(course.creditos) ||
      course.creditos < 1
    ) {
      throw new Error(`creditos de la materia ${id} debe ser un entero mayor que cero.`);
    }
    creditsByCourse.set(id, course.creditos);
  }
  for (const courseId of coursesWithGroups) {
    if (!creditsByCourse.has(courseId)) {
      throw new Error(`Hay grupos de la materia ${courseId}, que no existe en catalogo.materias.`);
    }
  }

  const prioritizedCourses: PrioritizedCourse[] = courses.map((course, index) => {
    const { courseId } = course;
    const credits = creditsByCourse.get(courseId);
    if (credits === undefined) {
      throw new Error(`La materia ${courseId} solicitada no existe en catalogo.materias.`);
    }
    return { ...course, credits, priority: readPriority(requests[index].priority, courseId) };
  });
  return {
    courses: prioritizedCourses,
    maxCredits,
    student,
    coursesWithGroups,
  };
}

export function readCreditLimit(value: unknown, field: "creditosMin" | "creditosMax") {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`estudiante.${field} debe ser un entero mayor que cero.`);
  }
  return value;
}

export function prepareLevelOne(input: unknown, maxSchedules = 100): LevelOneResponse {
  const parsed = readLevelOneInput(input);
  const { courses, maxCredits } = parsed;
  const result = generateLevelOneSchedules(courses, maxCredits, maxSchedules);
  return { level: 1, ...formatPrioritizedResult(parsed, result) };
}

export function formatPrioritizedResult(
  parsed: LevelOneInput,
  { schedules, truncated, unavailableHigh }: PrioritizedResult,
  emptyReason?: string,
): Omit<LevelOneResponse, "level"> {
  const { courses, maxCredits } = parsed;
  const reason = unavailableHigh.length
    ? unavailableHigh
        .map((id) => `Materia alta ${id}: ${sectionUnavailable(parsed, id)}.`)
        .join(" ")
    : schedules.length === 0
      ? (emptyReason ??
        `No se encontró una combinación sin cruces para las materias altas (${courses
          .filter(({ priority }) => priority === "alta")
          .map(({ courseId }) => courseId)
          .join(", ")}).`)
      : null;

  return {
    truncated,
    reason,
    maxCredits: Number.isFinite(maxCredits) ? maxCredits : null,
    schedules: schedules.map(({ assignments, totalCredits, omitted }, index) => ({
      name: `Horario ${index + 1}`,
      courses: formatAssignments(assignments),
      totalCredits,
      omitted: formatOmissions(parsed, omitted),
    })),
  };
}

export function validateLevelOneSelection(
  input: unknown,
  selection: unknown,
): Omit<PrioritizedSchedule, "name"> {
  return validatePrioritizedSelection(readLevelOneInput(input), selection);
}

export function validatePrioritizedSelection(
  parsed: LevelOneInput,
  selection: unknown,
): Omit<PrioritizedSchedule, "name"> {
  const assignments = readScheduleSelection(parsed.courses, selection);
  const evaluation = evaluateLevelOneSelection(parsed.courses, assignments, parsed.maxCredits);
  if (!evaluation.valid) {
    const { issue } = evaluation;
    switch (issue.kind) {
      case "missing-high":
        throw new Error(`El horario debe incluir la materia alta ${issue.courseId}.`);
      case "can-add":
        throw new Error(`La materia ${issue.courseId} puede agregarse al horario.`);
      case "can-replace":
        throw new Error(
          `La materia media ${issue.courseId} puede sustituir a la baja ${issue.lowerCourseId}.`,
        );
    }
  }
  return {
    courses: formatAssignments(assignments),
    totalCredits: evaluation.totalCredits,
    omitted: formatOmissions(parsed, evaluation.omitted),
  };
}

function readPriority(value: unknown, courseId: string): Priority {
  const normalized = typeof value === "string" ? value.trim().toLocaleLowerCase("es") : value;
  if (normalized === "alta" || normalized === 1) return "alta";
  if (normalized === "media" || normalized === 2) return "media";
  if (normalized === "baja" || normalized === 3) return "baja";
  throw new Error(`prioridad de la materia ${courseId} debe ser alta, media o baja.`);
}

function sectionUnavailable({ courses, coursesWithGroups }: LevelOneInput, id: string): string {
  if (!coursesWithGroups.has(id)) return "sin grupos en el catálogo";
  if (!courses.find(({ courseId }) => courseId === id)?.sections.length) {
    return "sin grupos con cupos disponibles";
  }
  return "los grupos con cupo tienen sesiones que se cruzan entre sí";
}

function formatOmissions(
  input: LevelOneInput,
  omitted: LevelOneOmission[],
): PrioritizedSchedule["omitted"] {
  return omitted.map(({ courseId, reasons }) => ({
    courseId,
    reasons: reasons.map((reason) => {
      switch (reason) {
        case "no-eligible-section":
          return sectionUnavailable(input, courseId);
        case "conflict":
          return "hay grupos elegibles que se cruzan con sesiones del horario";
        case "credit-limit":
          return "agregarla supera el máximo de créditos";
      }
    }),
  }));
}
