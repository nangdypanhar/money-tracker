/** Wording for cloud backup status. Pure: the current time is passed in. */
import { formatDate, toLocalDate } from "@/lib/finance/dates";
import type { SyncStatus } from "./engine";

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  "local-only": "Local only",
  "backed-up": "Backed up",
  waiting: "Waiting for backup",
  "backing-up": "Backing up…",
  failed: "Backup failed — will retry",
  "recovery-required": "Recovery required",
};

/** "just now", "5 min ago", "3 h ago", "yesterday", or a date. */
export function formatSince(iso: string | undefined, now: Date): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - t) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  const date = toLocalDate(new Date(t));
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date === toLocalDate(yesterday)) return "yesterday";
  return formatDate(date, { weekday: false, year: new Date(t).getFullYear() !== now.getFullYear() });
}
