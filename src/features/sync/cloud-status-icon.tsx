"use client";

import { CloudAlert, CloudCheck, CloudOff, CloudUpload, Cloud, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { SyncStatus } from "@/lib/sync/engine";
import { SYNC_STATUS_LABEL } from "@/lib/sync/status";
import { cn } from "@/lib/utils";
import { useSync } from "./sync-provider";

const ICONS: Record<SyncStatus, { icon: LucideIcon; className: string }> = {
  "local-only": { icon: CloudOff, className: "text-muted-foreground" },
  "backed-up": { icon: CloudCheck, className: "text-primary" },
  waiting: { icon: Cloud, className: "text-muted-foreground" },
  "backing-up": { icon: CloudUpload, className: "text-primary animate-pulse" },
  failed: { icon: CloudAlert, className: "text-chart-3" },
  "recovery-required": { icon: CloudAlert, className: "text-expense" },
};

export function CloudStatusIcon({ status, className }: { status: SyncStatus; className?: string }) {
  const { icon: Icon, className: tone } = ICONS[status];
  return <Icon aria-hidden className={cn("shrink-0", tone, className)} />;
}

/** Small status button for the Home header; only shown once cloud backup is on. */
export function CloudStatusButton() {
  const { state, status } = useSync();
  if (!state?.enabled) return null;
  return (
    <Link
      href="/backup"
      aria-label={`Cloud backup: ${SYNC_STATUS_LABEL[status]}`}
      title={SYNC_STATUS_LABEL[status]}
      className="grid size-11 place-items-center rounded-full border bg-card/60"
    >
      <CloudStatusIcon status={status} className="size-5" />
    </Link>
  );
}
