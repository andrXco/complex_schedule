import {
  findMeetingConflict,
  generateLevelZeroSchedules,
  type CourseRequirement,
  type CourseSection,
  type ScheduledMeeting,
} from "../../domain/scheduling/level-zero.ts";

type JsonRecord = Record<string, unknown>;

export type GeneratedSchedule = {
  name: string;
  courses: { courseId: string; sectionId: string; meetings: ScheduledMeeting[] }[];
};

export type PreparedLevelZero = {
  schedules: GeneratedSchedule[];
  truncated: boolean;
};

const dayAliases: Record<string, string> = {
  "1": "1",
  lunes: "1",
  lun: "1",
  "2": "2",
  martes: "2",
  mar: "2",
  "3": "3",
  miércoles: "3",
  miercoles: "3",
  mié: "3",
  mie: "3",
  "4": "4",
  jueves: "4",
  jue: "4",
  "5": "5",
  viernes: "5",
  vie: "5",
  "6": "6",
  sábado: "6",
  sabado: "6",
  sáb: "6",
  sab: "6",
};

/** Maps the project JSON contract into the pure level-zero scheduling domain. */
export function prepareLevelZero(input: unknown, maxSchedules = 100): PreparedLevelZero {
  const courses = readLevelZeroCourses(input);
  const result = generateLevelZeroSchedules(courses, maxSchedules);
  return {
    truncated: result.truncated,
    schedules: result.schedules.map((sections, index) => ({
      name: `Horario ${index + 1}`,
      courses: sections.map((section, sectionIndex) => ({
        courseId: courses[sectionIndex].courseId,
        sectionId: section.id,
        meetings: section.meetings,
      })),
    })),
  };
}

export function readLevelZeroCourses(input: unknown): CourseRequirement[] {
  const root = asRecord(input, "El JSON debe ser un objeto");
  const catalog = asRecord(root.catalogo, "Falta el bloque catalogo");
  const student = asRecord(root.estudiante, "Falta el bloque estudiante");
  const groups = asArray(catalog.grupos, "catalogo.grupos debe ser una lista");
  const requested = asArray(student.materias, "estudiante.materias debe ser una lista");
  if (requested.length === 0) throw new Error("El estudiante debe solicitar al menos una materia");

  const eligibleByCourse = new Map<string, CourseSection[]>();
  const groupIds = new Set<string>();
  for (const [index, item] of groups.entries()) {
    const group = asRecord(item, `El grupo ${index + 1} no es válido`);
    const id = readId(group.id ?? group.grupoId, `El grupo ${index + 1} no tiene id`);
    const courseId = readId(group.materiaId ?? group.courseId, `El grupo ${id} no tiene materia`);
    if (groupIds.has(id)) throw new Error(`El grupo ${id} está repetido en el catálogo.`);
    groupIds.add(id);

    const seats = group.cuposDisponibles;
    if (typeof seats !== "number" || !Number.isInteger(seats) || seats < 0) {
      throw new Error(`cuposDisponibles del grupo ${id} debe ser un entero mayor o igual a cero.`);
    }
    const sessions = asArray(group.sesiones ?? group.meetings, `El grupo ${id} no tiene sesiones`);
    if (sessions.length === 0) throw new Error(`El grupo ${id} debe tener al menos una sesión.`);
    const meetings = sessions.map((session, index) => readMeeting(session, id, index));

    if (seats === 0) continue;
    const sections = eligibleByCourse.get(courseId) ?? [];
    sections.push({ id, meetings });
    eligibleByCourse.set(courseId, sections);
  }

  const requestedIds = new Set<string>();
  return requested.map((item, index) => {
    const requirement = asRecord(item, `estudiante.materias[${index}] no es válido`);
    const courseId = readId(
      requirement.materiaId ?? requirement.id,
      `La materia ${index + 1} no tiene id`,
    );
    if (requestedIds.has(courseId)) throw new Error(`La materia ${courseId} está repetida.`);
    requestedIds.add(courseId);
    return { courseId, sections: eligibleByCourse.get(courseId) ?? [] };
  });
}

/** Rebuilds the chosen assignment using the source catalog's seats and sessions. */
export function validateLevelZeroSelection(
  input: unknown,
  selection: unknown,
): GeneratedSchedule["courses"] {
  const courses = readLevelZeroCourses(input);
  const schedule = asRecord(selection, "La estructura del horario no es válida.");
  const selected = asArray(schedule.courses, "El horario debe incluir los grupos elegidos.");
  if (selected.length !== courses.length) {
    throw new Error("El horario debe incluir un grupo por cada materia solicitada.");
  }

  const sectionByCourse = new Map<string, string>();
  for (const item of selected) {
    const choice = asRecord(item, "Hay un grupo inválido en el horario.");
    const courseId = readId(choice.courseId, "Una materia seleccionada no tiene id.");
    const sectionId = readId(choice.sectionId, "Un grupo seleccionado no tiene id.");
    if (sectionByCourse.has(courseId)) throw new Error(`La materia ${courseId} está repetida.`);
    sectionByCourse.set(courseId, sectionId);
  }

  const assignments = courses.map(({ courseId, sections }) => {
    const id = sectionByCourse.get(courseId);
    if (!id) throw new Error(`Falta el grupo de la materia ${courseId}.`);
    const section = sections.find((candidate) => candidate.id === id);
    if (!section)
      throw new Error(`El grupo ${id} no pertenece a ${courseId} o no tiene cupos disponibles.`);
    return { courseId, sectionId: section.id, meetings: section.meetings };
  });

  if (findMeetingConflict(assignments.flatMap(({ meetings }) => meetings))) {
    throw new Error("Las sesiones del horario se cruzan.");
  }
  return assignments;
}

function readMeeting(value: unknown, groupId: string, index: number): ScheduledMeeting {
  const meeting = asRecord(value, `La sesión ${index + 1} del grupo ${groupId} no es válida`);
  const day = normalizeDay(meeting.dia ?? meeting.day ?? meeting.diaSemana ?? meeting.dayOfWeek);
  const startMinute = normalizeTime(
    meeting.startMinute ?? meeting.horaInicio ?? meeting.inicio,
    "inicio",
  );
  const endMinute = normalizeTime(meeting.endMinute ?? meeting.horaFin ?? meeting.fin, "fin");
  if (startMinute < 0 || endMinute > 1440 || startMinute >= endMinute) {
    throw new Error(`La sesión del grupo ${groupId} debe tener un intervalo válido.`);
  }
  return { day, startMinute, endMinute };
}

function asRecord(value: unknown, message: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as JsonRecord;
}

function asArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function readId(value: unknown, message: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(message);
  const id = String(value).trim();
  if (!id) throw new Error(message);
  return id;
}

function normalizeDay(value: unknown): string {
  const key = String(value ?? "")
    .trim()
    .toLocaleLowerCase("es");
  if (!Object.prototype.hasOwnProperty.call(dayAliases, key)) {
    throw new Error(`Día inválido: ${String(value)}`);
  }
  return dayAliases[key];
}

function normalizeTime(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour <= 24 && minute < 60 && (hour < 24 || minute === 0)) return hour * 60 + minute;
    }
  }
  throw new Error(`La hora de ${label} debe ser minuto entero o formato HH:mm`);
}
