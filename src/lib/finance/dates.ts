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
