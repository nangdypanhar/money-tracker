"use client";

import { DatabaseBackup } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useData } from "@/features/data/data-provider";
import { useSync } from "@/features/sync/sync-provider";
import { backupReminderDue, lastBackupLabel } from "@/lib/backup/reminder";
import { getLastBackupAt } from "@/lib/db/storage";

const SNOOZE_KEY = "moneytrack:backup-reminder-snoozed-until";
const SNOOZE_DAYS = 3;

function isSnoozed(): boolean {
  try {
    return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
  } catch {
    return false;
  }
}

/** Nudges the user to back up when this device's only copy of their data is a week or more without a backup. */
export function BackupReminder() {
  const { data, mode } = useData();
  const { state: cloud } = useSync();
  const [lastBackupAt, setLastBackupAt] = useState<string | undefined | null>(null); // null = still loading
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLastBackupAt()
      .then((iso) => {
        if (cancelled) return;
        setLastBackupAt(iso);
        setSnoozed(isSnoozed());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const now = new Date();
  // Cloud backup on: its status icon takes over (and shows problems).
  if (mode !== "real" || snoozed || lastBackupAt === null || cloud?.enabled) return null;
  if (!backupReminderDue(lastBackupAt, now, data.transactions.length > 0)) return null;

  function later() {
    setSnoozed(true);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
    } catch {
      // Private mode: it just shows again next time.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-full border bg-card/90 py-1.5 pr-1.5 pl-3 text-xs">
      <DatabaseBackup className="size-3.5 shrink-0 text-primary" />
      <span className="flex-1 truncate">Last backup: {lastBackupLabel(lastBackupAt, now)}</span>
      <button type="button" onClick={later} className="h-7 shrink-0 rounded-full px-2.5 text-muted-foreground hover:bg-accent">
        Later
      </button>
      <Link href="/backup" className="grid h-7 shrink-0 place-items-center rounded-full bg-primary px-3 font-medium text-primary-foreground">
        Back up
      </Link>
    </div>
  );
}
