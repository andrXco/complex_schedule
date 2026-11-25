"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GeneratedSchedule } from "../application/scheduling/prepare-level-zero";
import type { LevelThreeResponse } from "../application/scheduling/prepare-level-three";
import { lunchWindow } from "../domain/scheduling/lunch-window";

type View = "auth" | "home" | "generated" | "saved" | "upload" | "calendar";
type User = { id: string; name: string; email: string };
function Icon({
  name,
  size = 19,
}: {
  name:
    | "user"
    | "calendar"
    | "bookmark"
    | "download"
    | "upload"
    | "file"
    | "play"
    | "check"
    | "arrow";
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M3.5 10h17" />
      </>
    ),
    bookmark: <path d="M6.5 3.5h11v17l-5.5-3.6-5.5 3.6z" />,
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M5 19.5h14" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m0 0 4 4m-4-4L8 8" />
        <path d="M5 19.5h14" />
      </>
    ),
    file: (
      <>
        <path d="M7 2.5h7l4 4v15H7z" />
        <path d="M14 2.5v4h4" />
      </>
    ),
    play: <path d="m9 7 8 5-8 5z" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="m15 18-6-6 6-6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Button({
  children,
  icon,
  primary = false,
  active = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  icon?: Parameters<typeof Icon>[0]["name"];
  primary?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`button ${primary ? "button-primary" : ""} ${active ? "button-saved" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

function Header({
  view,
  setView,
  user,
  users,
  setUser,
}: {
  view: View;
  setView: (view: View) => void;
  user: User;
  users: User[];
  setUser: (user: User) => void;
}) {
  return (
    <header className="header">
      <div className="header-inner">
        <button className="brand" onClick={() => setView("home")} aria-label="Ir al inicio">
          <span className="brand-mark">H</span>
          <span>
            <strong>Mis horarios</strong>
            <small>Periodo 2026-30</small>
          </span>
        </button>
        <nav className="nav">
          <button className={view === "home" ? "nav-active" : ""} onClick={() => setView("home")}>
            Inicio
          </button>
          <button
            className={view === "generated" ? "nav-active" : ""}
            onClick={() => setView("generated")}
          >
            Horarios
          </button>
          <button className={view === "saved" ? "nav-active" : ""} onClick={() => setView("saved")}>
            Guardados
          </button>
          <button
            className={view === "upload" ? "nav-active" : ""}
            onClick={() => setView("upload")}
          >
            Subir JSON
          </button>
        </nav>
        <div className="account">
          <details className="account-switcher">
            <summary aria-label="Cambiar usuario">
              <span className="avatar">
                <Icon name="user" />
              </span>
              <span className="account-copy">
                <strong>{user.name}</strong>
                <small>Usuario de prueba</small>
              </span>
              <span className="switch-chevron" />
            </summary>
            <div className="account-menu">
              <div className="account-menu-heading">
                <strong>Cambiar usuario</strong>
                <small>{users.length} perfiles disponibles</small>
              </div>
              <div className="account-options">
                {users.map((profile) => (
                  <button
                    className={profile.id === user.id ? "selected" : ""}
                    type="button"
                    key={profile.id}
                    onClick={(event) => {
                      setUser(profile);
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                  >
                    <span className="menu-avatar">
                      {profile.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </span>
                    <span>
                      <strong>{profile.name}</strong>
                      <small>{profile.email}</small>
                    </span>
                    {profile.id === user.id && <Icon name="check" size={17} />}
                  </button>
                ))}
              </div>
            </div>
          </details>
          <button className="logout" onClick={() => setView("auth")}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}

function Auth({
  users,
  status,
  onLogin,
}: {
  users: User[];
  status: string;
  onLogin: (user: User) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="auth-copy">
          <div className="brand auth-brand">
            <span className="brand-mark">H</span>
            <span>
              <strong>Mis horarios</strong>
              <small>Periodo 2026-30</small>
            </span>
          </div>
          <h1>
            Arma tu horario del
            <br />
            semestre
          </h1>
          <p>
            Sube tu archivo JSON, revisa los horarios válidos que genera el algoritmo y guarda el
            que más te sirva.
          </p>
        </div>
      </section>
      <section className="auth-form-side">
        <form className="auth-card" onSubmit={(event) => event.preventDefault()}>
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >
              Registrarse
            </button>
          </div>
          <div className="auth-heading">
            <h2>{mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h2>
            <p>
              {mode === "login"
                ? "Ingresa para ver tus horarios guardados."
                : "Regístrate para comenzar a organizar tu semestre."}
            </p>
          </div>
          {mode === "login" && (
            <>
              <div className="quick-label">
                <span>Acceso rápido</span>
                <small>Selecciona un perfil de demostración</small>
              </div>
              {status && (
                <p role="status" className="footnote">
                  {status}
                </p>
              )}
              <div className="quick-users">
                {users.map((user) => (
                  <button
                    className="quick-user"
                    type="button"
                    key={user.id}
                    onClick={() => onLogin(user)}
                  >
                    <span className="quick-avatar">
                      {user.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </span>
                    <span className="quick-user-copy">
                      <strong>{user.name}</strong>
                      <small>Usuario de prueba</small>
                    </span>
                    <span className="quick-enter">Entrar</span>
                  </button>
                ))}
              </div>
              <div className="auth-divider">
                <span>o continúa con tu correo</span>
              </div>
            </>
          )}
          <fieldset disabled className="auth-fields" aria-describedby="local-access-note">
            {mode === "register" && (
              <label className="field">
                <span>Nombre completo</span>
                <input type="text" placeholder="Tu nombre" required />
              </label>
            )}
            <label className="field">
              <span>Correo electrónico</span>
              <input type="email" placeholder="correo@ejemplo.com" required />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input type="password" placeholder="••••••••" required />
            </label>
            {mode === "register" && (
              <label className="field">
                <span>Confirmar contraseña</span>
                <input type="password" placeholder="••••••••" required />
              </label>
            )}
            <button className="auth-submit" type="submit">
              {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </button>
          </fieldset>
          <p id="local-access-note" className="footnote">
            El acceso con correo se habilitará cuando se conecte la autenticación. Para probar,
            elige un perfil en Acceso rápido.
          </p>
        </form>
      </section>
    </main>
  );
}

function Home({ setView, user }: { setView: (view: View) => void; user: User }) {
  const options = [
    {
      title: "Subir archivo",
      description: "Carga un JSON para generar nuevas opciones de horario.",
      icon: "upload" as const,
      action: () => setView("upload"),
    },
    {
      title: "Horarios generados",
      description: "Revisa los horarios válidos encontrados por el algoritmo.",
      icon: "calendar" as const,
      action: () => setView("generated"),
    },
    {
      title: "Horarios guardados",
      description: "Consulta los horarios que decidiste conservar.",
      icon: "bookmark" as const,
      action: () => setView("saved"),
    },
  ];

  return (
    <section className="home">
      <div className="home-heading">
        <span>Panel principal</span>
        <h1>Hola, {user.name.split(" ")[0]}</h1>
        <p>¿Qué quieres hacer hoy?</p>
      </div>
      <div className="home-options">
        {options.map((option) => (
          <button className="home-card" onClick={option.action} key={option.title}>
            <span className="home-card-icon">
              <Icon name={option.icon} size={25} />
            </span>
            <span>
              <strong>{option.title}</strong>
              <small>{option.description}</small>
            </span>
            <span className="home-arrow">Ir</span>
          </button>
        ))}
      </div>
    </section>
  );
}

type SavedSchedule = {
  id: string;
  title: string;
  level: number;
  schedule: Partial<GeneratedSchedule>;
  source_json: unknown;
  created_at: string;
  owner_name: string;
  participants: (User & { role: "owner" | "participant" })[];
};
type ScheduleView = {
  title: string;
  level: number;
  schedule: GeneratedSchedule;
  source: unknown;
};
type ValidatedFile = { name: string; source: unknown };

function Upload({
  users,
  participantIds,
  onParticipantsChange,
  title,
  onTitleChange,
  file,
  onFileChange,
  onGenerate,
  onCancel,
  busy,
}: {
  users: User[];
  participantIds: string[];
  onParticipantsChange: (ids: string[]) => void;
  title: string;
  onTitleChange: (title: string) => void;
  file: ValidatedFile | null;
  onFileChange: (file: ValidatedFile | null) => void;
  onGenerate: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const validation = useRef(0);
  const [fileName, setFileName] = useState(file?.name ?? "");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");

  async function chooseFile(name: string, read: () => Promise<unknown>) {
    const attempt = ++validation.current;
    setFileName(name);
    setValidating(true);
    setError("");
    onFileChange(null);
    try {
      const source = await read();
      await post("/api/generate", { sourceJson: source, validateOnly: true });
      if (attempt === validation.current) onFileChange({ name, source });
    } catch (cause) {
      if (attempt === validation.current) setError(message(cause));
    } finally {
      if (attempt === validation.current) setValidating(false);
    }
  }

  useEffect(
    () => () => {
      validation.current += 1;
    },
    [],
  );

  return (
    <>
      <div className="page-heading">
        <h1>Subir JSON</h1>
        <p>
          Al elegir el archivo se valida de inmediato. Solo podrás ejecutar el algoritmo si es
          válido.
        </p>
      </div>
      <section className="file-card">
        <span className="file-icon">
          <Icon name="file" size={24} />
        </span>
        <div>
          <strong>{fileName || "Archivo JSON del estudiante"}</strong>
          <small>{fileName ? "Archivo seleccionado" : "Selecciona un archivo para comenzar"}</small>
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!selected) return;
            void chooseFile(selected.name, async () => {
              try {
                return JSON.parse(await selected.text());
              } catch {
                throw new Error("El archivo no contiene JSON válido.");
              }
            });
          }}
        />
        <Button disabled={busy} onClick={() => input.current?.click()}>
          {fileName ? "Elegir otro archivo" : "Elegir archivo"}
        </Button>
      </section>
      <div className="sample-upload">
        <Button
          disabled={busy || validating}
          onClick={() =>
            void chooseFile("horario-ejemplo.json", () => api("/horario-ejemplo.json"))
          }
        >
          Usar JSON de ejemplo
        </Button>
      </div>
      {validating && <p role="status">Validando archivo…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {file && (
        <>
          <section className="success-card" role="status">
            <Icon name="check" size={27} />
            <div>
              <strong>Archivo válido</strong>
              <p>No se encontraron errores. Ya puedes ejecutar el algoritmo.</p>
            </div>
          </section>
          <div className="validation-grid">
            <div>
              <Icon name="check" />
              <strong>Bloque catalogo</strong>
            </div>
            <div>
              <Icon name="check" />
              <strong>Bloque estudiante</strong>
            </div>
          </div>
        </>
      )}
      <fieldset className="participant-picker" disabled={busy}>
        <legend>Participantes del horario</legend>
        <p>El horario guardado se compartirá con los perfiles que selecciones.</p>
        {users.map((user) => (
          <label key={user.id}>
            <input
              type="checkbox"
              checked={participantIds.includes(user.id)}
              onChange={(event) => {
                onParticipantsChange(
                  event.target.checked
                    ? [...participantIds, user.id]
                    : participantIds.filter((id) => id !== user.id),
                );
              }}
            />
            {user.name}
          </label>
        ))}
        {users.length === 0 && <p>No hay otros perfiles disponibles.</p>}
      </fieldset>
      <label className="field">
        <span>Nombre para guardar (opcional)</span>
        <input
          type="text"
          value={title}
          maxLength={120}
          disabled={busy}
          placeholder="Se usará el nombre del horario"
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>
      <div className="upload-actions">
        <Button disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
        <Button primary icon="play" disabled={!file || busy} onClick={onGenerate}>
          {busy ? "Generando…" : "Ejecutar algoritmo"}
        </Button>
      </div>
    </>
  );
}

function Generated({
  result,
  source,
  savedIndices,
  savingIndex,
  onSave,
  onCalendar,
  onUpload,
}: {
  result: LevelThreeResponse | null;
  source: unknown;
  savedIndices: Set<number>;
  savingIndex: number | null;
  onSave: (index: number) => void;
  onCalendar: (item: ScheduleView) => void;
  onUpload: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <h1>Horarios generados</h1>
        <p>Horarios válidos que encontró el algoritmo para tu archivo.</p>
      </div>
      {result ? (
        <>
          <section className="summary-card">
            <div className="metric">
              <span>{result.schedules.length ? "Nivel alcanzado" : "Nivel evaluado"}</span>
              <strong>{result.level}</strong>
            </div>
            <div className="metric">
              <span>Horarios válidos</span>
              <strong>
                {result.schedules.length}
                {result.truncated ? "+" : ""}
              </strong>
            </div>
            <div className="criteria">
              <span>Restricciones activas</span>
              <div>
                <em>Sesiones sin cruces</em>
                <em>Grupos con cupo</em>
                <em>Prioridades de materias</em>
                {result.minCredits > 0 && <em>Mínimo de {result.minCredits} créditos</em>}
                {result.maxCredits !== null && <em>Máximo de {result.maxCredits} créditos</em>}
                <em>{lunchLabel}</em>
              </div>
            </div>
          </section>
          {result.reason && <p className="footnote">{result.reason}</p>}
          <div className="schedule-list">
            {result.schedules.map((schedule, index) => {
              const item = { title: schedule.name, level: result.level, schedule, source };
              const saved = savedIndices.has(index);
              return (
                <article className="schedule-card" key={schedule.name}>
                  <div className="schedule-top">
                    <h2>{schedule.name}</h2>
                    <span className="credit-pill">{scheduleSize(item)}</span>
                  </div>
                  <OmittedCourses item={item} />
                  <div className="actions">
                    <Button primary icon="calendar" onClick={() => onCalendar(item)}>
                      Ver calendario
                    </Button>
                    <Button
                      icon={saved ? "check" : "bookmark"}
                      active={saved}
                      disabled={saved || savingIndex !== null}
                      onClick={() => onSave(index)}
                    >
                      {saved ? "Guardado" : savingIndex === index ? "Guardando…" : "Guardar"}
                    </Button>
                    <DownloadButtons item={item} />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="schedule-list">
          <p>Sube el JSON de un estudiante para generar horarios.</p>
          <div>
            <Button primary icon="upload" onClick={onUpload}>
              Subir JSON
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function Saved({
  userId,
  onUpload,
  onCalendar,
}: {
  userId: string;
  onUpload: () => void;
  onCalendar: (item: ScheduleView) => void;
}) {
  const [schedules, setSchedules] = useState<SavedSchedule[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<{ schedules: SavedSchedule[] }>(`/api/schedules?userId=${encodeURIComponent(userId)}`, {
      signal: controller.signal,
    })
      .then(({ schedules }) => setSchedules(schedules))
      .catch((cause) => {
        if (!controller.signal.aborted) setError(message(cause));
      });
    return () => controller.abort();
  }, [userId]);

  return (
    <>
      <div className="title-row">
        <div className="page-heading">
          <h1>Mis horarios guardados</h1>
          <p>Consulta tus horarios y los que compartieron contigo.</p>
        </div>
        <Button primary icon="upload" onClick={onUpload}>
          Subir JSON
        </Button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {schedules === null && !error && <p role="status">Cargando horarios…</p>}
      {schedules?.length === 0 && <p className="footnote">Todavía no hay horarios guardados.</p>}
      <div className="saved-list">
        {schedules?.map((record) => {
          const item: ScheduleView = {
            title: record.title,
            level: record.level,
            schedule: { ...record.schedule, name: record.title, courses: record.schedule.courses ?? [] },
            source: record.source_json,
          };
          return (
            <article className="saved-card" key={record.id}>
              <div>
                <h2>{record.title}</h2>
                <span className="level-pill">Nivel alcanzado: {record.level}</span>
                <p className="saved-details">
                  {new Date(record.created_at).toLocaleDateString("es-CO", {
                    dateStyle: "long",
                    timeZone: "America/Bogota",
                  })}
                  {" · "}
                  {record.owner_name}
                </p>
                {record.participants.some(({ role }) => role === "participant") && (
                  <p className="saved-details">
                    Participantes:{" "}
                    {record.participants
                      .filter(({ role }) => role === "participant")
                      .map(({ name }) => name)
                      .join(", ")}
                  </p>
                )}
              </div>
              <div className="actions">
                <Button primary icon="calendar" onClick={() => onCalendar(item)}>
                  Abrir calendario
                </Button>
                <DownloadButtons item={item} />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const colors = ["blue", "green", "yellow", "purple"];
const lunchLabel = `Almuerzo libre de ${formatTime(lunchWindow.startMinute)} a ${formatTime(lunchWindow.endMinute)}`;

function Calendar({ item, onBack }: { item: ScheduleView; onBack: () => void }) {
  const catalog = catalogEntries(item.source);
  const sessions = item.schedule.courses.flatMap((course, index) =>
    course.meetings.map((meeting) => ({
      ...meeting,
      course,
      color: colors[index % colors.length],
    })),
  );
  const startHour = Math.min(7, ...sessions.map(({ startMinute }) => Math.floor(startMinute / 60)));
  const endHour = Math.max(17, ...sessions.map(({ endMinute }) => Math.ceil(endMinute / 60)));
  const minutes = (endHour - startHour) * 60;
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

  return (
    <>
      <button className="back" type="button" onClick={onBack}>
        <Icon name="arrow" />
        Volver a la lista
      </button>
      <div className="calendar-title">
        <div>
          <h1>{item.title}</h1>
          <p>
            {scheduleSize(item)} · Nivel alcanzado: {item.level}
          </p>
          {item.level >= 3 && <p>{lunchLabel}</p>}
        </div>
        <div className="actions">
          <DownloadButtons item={item} fullLabel />
        </div>
      </div>
      {!!item.schedule.omitted?.length && <OmittedCourses item={item} />}
      {sessions.length === 0 ? (
        <p className="footnote">Este horario no tiene sesiones registradas.</p>
      ) : (
        <div className="calendar-wrap">
          <div className="calendar-grid timetable">
            <div className="calendar-head time-head">Hora</div>
            {days.map((day) => (
              <div className="calendar-head" key={day}>
                {day}
              </div>
            ))}
            <div className="time-column">
              {hours.map((hour) => (
                <span key={hour}>{formatTime(hour * 60)}</span>
              ))}
            </div>
            {days.map((day, index) => (
              <div className="day-column timetable-day" key={day} style={{ gridColumn: index + 2 }}>
                {item.level >= 3 && (
                  <div
                    className="lunch-window"
                    aria-hidden="true"
                    style={{
                      top: `${((lunchWindow.startMinute - startHour * 60) / minutes) * 100}%`,
                      height: `${((lunchWindow.endMinute - lunchWindow.startMinute) / minutes) * 100}%`,
                    }}
                  />
                )}
                {sessions
                  .filter((session) => Number(session.day) === index + 1)
                  .map((session) => {
                    const name =
                      catalog.get(session.course.courseId)?.name ?? session.course.courseId;
                    const interval = `${formatTime(session.startMinute)}–${formatTime(session.endMinute)}`;
                    return (
                      <div
                        className={`class-block ${session.color}`}
                        key={`${session.course.courseId}-${session.startMinute}-${session.endMinute}`}
                        style={{
                          top: `${((session.startMinute - startHour * 60) / minutes) * 100}%`,
                          height: `${((session.endMinute - session.startMinute) / minutes) * 100}%`,
                        }}
                        title={`${name} · Grupo ${session.course.sectionId} · ${interval}`}
                      >
                        <strong>{name}</strong>
                        <span>
                          Grupo {session.course.sectionId} · {interval}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function catalogEntries(source: unknown) {
  const catalog = source as { catalogo?: { materias?: unknown } } | null;
  const entries = new Map<string, { name?: string; credits?: number }>();
  if (!Array.isArray(catalog?.catalogo?.materias)) return entries;
  for (const entry of catalog.catalogo.materias) {
    if (!entry || (typeof entry.id !== "string" && typeof entry.id !== "number")) continue;
    entries.set(String(entry.id).trim(), {
      name: typeof entry.nombre === "string" ? entry.nombre : undefined,
      credits: typeof entry.creditos === "number" ? entry.creditos : undefined,
    });
  }
  return entries;
}

function omissionLabels(item: ScheduleView) {
  const catalog = catalogEntries(item.source);
  return (item.schedule.omitted ?? []).map(({ courseId, reasons }) => ({
    courseId,
    label: `${catalog.get(courseId)?.name ?? courseId} (${reasons.join(", ")})`,
  }));
}

function OmittedCourses({ item }: { item: ScheduleView }) {
  const omissions = omissionLabels(item);
  return (
    <div className="omitted">
      <strong>Materias omitidas</strong>
      {omissions.length ? (
        omissions.map(({ courseId, label }) => <span key={courseId}>{label}</span>)
      ) : (
        <span className="plain">Ninguna</span>
      )}
    </div>
  );
}

function scheduleSize(item: ScheduleView) {
  if (item.schedule.totalCredits !== undefined) {
    return `${item.schedule.totalCredits} créditos totales`;
  }
  const catalog = catalogEntries(item.source);
  const credits = item.schedule.courses.map(({ courseId }) => catalog.get(courseId)?.credits);
  if (credits.length > 0 && credits.every((credit): credit is number => credit !== undefined)) {
    return `${credits.reduce((total, credit) => total + credit, 0)} créditos totales`;
  }
  const count = item.schedule.courses.length;
  return `${count} ${count === 1 ? "materia" : "materias"}`;
}

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  return `${hour.toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
}

function DownloadButtons({ item, fullLabel = false }: { item: ScheduleView; fullLabel?: boolean }) {
  function download(extension: "json" | "txt") {
    const catalog = catalogEntries(item.source);
    const text = item.schedule.courses.flatMap((course) => [
      `${catalog.get(course.courseId)?.name ?? course.courseId} · Grupo ${course.sectionId}`,
      ...course.meetings.map(
        (session) =>
          `  ${days[Number(session.day) - 1]} ${formatTime(session.startMinute)}–${formatTime(session.endMinute)}`,
      ),
    ]);
    const omissions = omissionLabels(item);
    const summary = item.level >= 1 ? [`Nivel ${item.level} · ${scheduleSize(item)}`] : [];
    const omitted = omissions.length
      ? ["", "Materias omitidas", ...omissions.map(({ label }) => `  ${label}`)]
      : [];
    const content =
      extension === "json"
        ? JSON.stringify(item.schedule, null, 2)
        : [item.title, ...summary, ...text, ...omitted].join("\n");
    const url = URL.createObjectURL(
      new Blob([content], {
        type: extension === "json" ? "application/json" : "text/plain;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${item.title}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button icon="download" onClick={() => download("json")}>
        {fullLabel ? "Descargar JSON" : "JSON"}
      </Button>
      <Button icon="download" onClick={() => download("txt")}>
        {fullLabel ? "Descargar TXT" : "TXT"}
      </Button>
    </>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo completar la solicitud.");
  return body as T;
}

function post<T>(url: string, body: unknown) {
  return api<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

function SignedIn({
  user,
  users,
  setUser,
}: {
  user: User;
  users: User[];
  setUser: (user: User | null) => void;
}) {
  const [view, setView] = useState<Exclude<View, "auth">>("home");
  const [file, setFile] = useState<ValidatedFile | null>(null);
  const [result, setResult] = useState<LevelThreeResponse | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [savedIndices, setSavedIndices] = useState(new Set<number>());
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [calendar, setCalendar] = useState<{
    item: ScheduleView;
    back: "generated" | "saved";
  } | null>(null);

  function navigate(next: View) {
    if (next === "auth") {
      setUser(null);
      return;
    }
    setStatus("");
    setView(next);
  }

  function openCalendar(item: ScheduleView, back: "generated" | "saved") {
    setCalendar({ item, back });
    navigate("calendar");
  }

  async function generate() {
    if (!file || generating) return;
    setStatus("");
    setGenerating(true);
    try {
      setResult(await post<LevelThreeResponse>("/api/generate", { sourceJson: file.source }));
      setSavedIndices(new Set());
      navigate("generated");
    } catch (error) {
      setStatus(message(error));
    } finally {
      setGenerating(false);
    }
  }

  async function save(index: number) {
    const schedule = result?.schedules[index];
    if (!file || !result || !schedule || savingIndex !== null || savedIndices.has(index)) return;
    setStatus("");
    setSavingIndex(index);
    try {
      await post("/api/schedules", {
        ownerUserId: user.id,
        participantIds,
        title: title.trim() || schedule.name,
        level: result.level,
        sourceJson: file.source,
        schedule,
      });
      setSavedIndices((current) => new Set(current).add(index));
    } catch (error) {
      setStatus(message(error));
    } finally {
      setSavingIndex(null);
    }
  }

  return (
    <div className="app-shell">
      <Header view={view} setView={navigate} user={user} users={users} setUser={setUser} />
      <main className={`main ${view === "calendar" ? "calendar-page" : ""}`}>
        {status && (
          <p className="form-error" role="alert">
            {status}
          </p>
        )}
        {view === "home" && <Home setView={navigate} user={user} />}
        {view === "upload" && (
          <Upload
            users={users.filter((item) => item.id !== user.id)}
            participantIds={participantIds}
            onParticipantsChange={setParticipantIds}
            title={title}
            onTitleChange={setTitle}
            file={file}
            busy={generating || savingIndex !== null}
            onFileChange={(next) => {
              setFile(next);
              setResult(null);
              setSavedIndices(new Set());
              setStatus("");
            }}
            onGenerate={() => void generate()}
            onCancel={() => navigate("home")}
          />
        )}
        {view === "generated" && (
          <Generated
            result={result}
            source={file?.source}
            savingIndex={savingIndex}
            savedIndices={savedIndices}
            onSave={(index) => void save(index)}
            onUpload={() => navigate("upload")}
            onCalendar={(item) => openCalendar(item, "generated")}
          />
        )}
        {view === "saved" && (
          <Saved
            userId={user.id}
            onUpload={() => navigate("upload")}
            onCalendar={(item) => openCalendar(item, "saved")}
          />
        )}
        {view === "calendar" && calendar && (
          <Calendar item={calendar.item} onBack={() => navigate(calendar.back)} />
        )}
      </main>
    </div>
  );
}

export default function ScheduleWorkspace() {
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState("Cargando perfiles de prueba…");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<{ users: User[] }>("/api/users", { signal: controller.signal })
      .then(({ users }) => {
        setUsers(users);
        setStatus(users.length ? "" : "No hay perfiles de prueba disponibles.");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setStatus(message(error));
      });
    return () => controller.abort();
  }, []);

  return user ? (
    <SignedIn key={user.id} user={user} users={users} setUser={setUser} />
  ) : (
    <Auth users={users} status={status} onLogin={setUser} />
  );
}
