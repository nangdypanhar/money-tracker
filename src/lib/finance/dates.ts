import type { DateRange, LocalDate } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Format a Date as a local calendar date (not UTC). */
export function toLocalDate(date: Date): LocalDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLocalTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalDate(value: LocalDate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The app's one date style, day before month: "Sat, 17 Nov 2026" (weekday "long": "Saturday, 17 Nov 2026").
 * `year: false` drops the year ("Sat, 17 Nov") — used where the current year goes without saying.
 */
export function formatDate(
  date: LocalDate,
  { weekday = "short", year = true }: { weekday?: "short" | "long" | false; year?: boolean } = {},
): string {
  const d = parseLocalDate(date);
  const day = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ""}`;
  if (!weekday) return day;
  const name = WEEKDAY_NAMES[d.getDay()];
  return `${weekday === "long" ? name : name.slice(0, 3)}, ${day}`;
}

/** A month is identified as "YYYY-MM". */
export type MonthKey = string;

export function monthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function monthRange(key: MonthKey): DateRange {
  const [y, m] = key.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${key}-01`, end: `${key}-${pad(lastDay)}` };
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function monthLabel(key: MonthKey, style: "short" | "long" = "long"): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: style });
}

export function addDays(date: LocalDate, delta: number): LocalDate {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + delta);
  return toLocalDate(d);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -((parseLocalDate(date).getDay() + 6) % 7));
}

/** "YYYY-MM-DD" strings compare correctly as strings. */
export function inRange(date: LocalDate, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function daysInRange(range: DateRange): LocalDate[] {
  const days: LocalDate[] = [];
  const cursor = parseLocalDate(range.start);
  const end = parseLocalDate(range.end);
  while (cursor <= end) {
    days.push(toLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Display a stored "HH:mm" time in 12-hour form ("13:16" → "1:16 PM"). Storage stays 24-hour so it sorts. */
export function formatTime12(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${match[2]} ${period}`;
}

/**
 * Parse a typed date. Accepts "2026-10-15", day-first "15/10/2026", "15-10-26", and "15/10" (this year).
 * Returns null when it isn't a real calendar date.
 */
export function parseDateInput(text: string, today: LocalDate): LocalDate | null {
  const value = text.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dmy = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2}|\d{4}))?$/.exec(value);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) {
    [d, m] = [Number(dmy[1]), Number(dmy[2])];
    y = dmy[3] === undefined ? Number(today.slice(0, 4)) : Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
  } else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return toLocalDate(date);
}
