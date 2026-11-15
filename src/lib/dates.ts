// Calendar-date helpers. A "Ymd" is a "YYYY-MM-DD" string. Postgres DATE
// columns come back from Prisma as JS Dates at UTC midnight, so all
// conversion is done in UTC to avoid off-by-one-day bugs.

export type Ymd = string;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: unknown): value is Ymd {
  if (typeof value !== "string" || !YMD_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function toDbDate(ymd: Ymd): Date {
  if (!isYmd(ymd)) throw new Error(`Invalid date: ${ymd}`);
  return new Date(`${ymd}T00:00:00Z`);
}

export function fromDbDate(d: Date): Ymd {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: Ymd, days: number): Ymd {
  const d = toDbDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

/** Whole days from `a` to `b` (b - a). */
export function diffDays(a: Ymd, b: Ymd): number {
  return Math.round((toDbDate(b).getTime() - toDbDate(a).getTime()) / 86_400_000);
}

/** Today's calendar date in the Gemach's timezone. */
export function todayYmd(timeZone = "America/New_York", now: Date = new Date()): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Inclusive range overlap for Ymd strings (lexicographic order == date order). */
export function rangesOverlap(aStart: Ymd, aEnd: Ymd, bStart: Ymd, bEnd: Ymd): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

const LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const MEDIUM = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

type DateLike = Ymd | Date | null | undefined;
function asDate(v: DateLike): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  return isYmd(v) ? toDbDate(v) : null;
}

export function formatDate(v: DateLike, style: "long" | "medium" | "short" = "medium"): string {
  const d = asDate(v);
  if (!d) return "—";
  return (style === "long" ? LONG : style === "short" ? SHORT : MEDIUM).format(d);
}

export function formatDateTime(v: Date | null | undefined, timeZone = "America/New_York"): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(v);
}

export function monthKey(ymd: Ymd): string {
  return ymd.slice(0, 7);
}

export function formatMonth(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(d);
}
