/** When to remind the user to back up. Pure: the current time is passed in. */

export const BACKUP_REMINDER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since `iso` (0 = within the last 24h), or null if there's no valid date. */
export function daysSince(iso: string | undefined, now: Date): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/** Remind once there's data worth losing and no backup in the last week (or ever). */
export function backupReminderDue(lastBackupAt: string | undefined, now: Date, hasRecords: boolean): boolean {
  if (!hasRecords) return false;
  const days = daysSince(lastBackupAt, now);
  return days === null || days >= BACKUP_REMINDER_DAYS;
}

export function lastBackupLabel(lastBackupAt: string | undefined, now: Date): string {
  const days = daysSince(lastBackupAt, now);
  if (days === null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
