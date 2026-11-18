/** ManyChat "Pausa inteligente": when to continue. */
export interface SmartDelayData {
  mode?: "duration" | "date";
  duration?: number;
  unit?: "seconds" | "minutes" | "hours" | "days";
  /** "Enviar dentro de un horario específico" */
  schedule?: { enabled?: boolean; from?: number; to?: number; days?: number[] };
  dateMode?: "specific" | "dynamic";
  /** datetime-local value, e.g. 2026-11-20T10:00 */
  date?: string;
  /** custom field slug holding the date ("Fecha dinámica") */
  dateField?: string;
  /** IANA time zone of the account (taken from the builder's browser). */
  tz?: string;
}

const UNIT_MS = { seconds: 1000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;
const MAX_MS = 365 * UNIT_MS.days;

function localParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    y: Number(get("year")),
    mo: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")) % 24,
    mi: Number(get("minute")),
    s: Number(get("second")),
    wd,
  };
}

/** A wall-clock time in `tz` → the real instant. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = localParts(new Date(guess), tz);
  const asIfUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return new Date(guess - (asIfUtc - guess));
}

function parseWallClock(value: string, tz: string): Date | null {
  const m = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return zonedToUtc(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, tz);
  const dmy = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (dmy) return zonedToUtc(+dmy[3], +dmy[2], +dmy[1], dmy[4] ? +dmy[4] : 0, dmy[5] ? +dmy[5] : 0, tz);
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Move `at` forward until it falls inside the allowed hours and days. */
function fitSchedule(at: Date, s: NonNullable<SmartDelayData["schedule"]>, tz: string): Date {
  const from = s.from ?? 8;
  const to = s.to ?? 22;
  const days = s.days && s.days.length ? s.days : [0, 1, 2, 3, 4, 5, 6];
  const inHours = (h: number) => (from < to ? h >= from && h < to : to === 0 ? h >= from : h >= from || h < to);
  let t = at.getTime();
  for (let i = 0; i < 24 * 9; i++) {
    const p = localParts(new Date(t), tz);
    if (days.includes(p.wd) && inHours(p.h)) return new Date(t);
    // jump to the start of the next local hour
    t += (60 - p.mi) * 60_000 - p.s * 1000;
  }
  return at;
}

/**
 * When the run should continue, or null when it must stop (date already passed
 * or no valid date), like ManyChat.
 */
export function smartDelayRunAt(data: SmartDelayData, fieldValue?: string | null, now = new Date()): Date | null {
  const tz = data.tz || "America/El_Salvador";
  if (data.mode === "date") {
    const at =
      data.dateMode === "dynamic"
        ? fieldValue
          ? parseWallClock(fieldValue, tz)
          : null
        : data.date
          ? parseWallClock(data.date, tz)
          : null;
    if (!at || at.getTime() <= now.getTime()) return null;
    return at;
  }
  const ms = Math.min(MAX_MS, Math.max(0, Number(data.duration ?? 1)) * (UNIT_MS[data.unit ?? "hours"] ?? UNIT_MS.hours));
  let at = new Date(now.getTime() + ms);
  if (data.schedule?.enabled) at = fitSchedule(at, data.schedule, tz);
  return at;
}

const UNIT_LABEL = { seconds: "Segundos", minutes: "Minutos", hours: "Horas", days: "Días" } as const;
const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function smartDelaySummary(d: SmartDelayData): { lead: string; bold: string; tail: string } {
  if (d.mode === "date") {
    if (d.dateMode === "dynamic") return { lead: "Espera hasta la fecha de", bold: d.dateField || "un campo", tail: "" };
    return {
      lead: "Espera hasta",
      bold: d.date ? d.date.replace("T", " ") : "una fecha",
      tail: "",
    };
  }
  const s = d.schedule;
  let tail = "";
  if (s?.enabled) {
    const days = s.days && s.days.length && s.days.length < 7 ? ` (${s.days.map((x) => DAY_SHORT[x]).join(", ")})` : "";
    tail = ` y luego continúa de ${s.from ?? 8}:00 a ${s.to ?? 22}:00${days}`;
  }
  return { lead: "Espera al menos", bold: `${d.duration ?? 1} ${UNIT_LABEL[d.unit ?? "hours"]}`, tail };
}
