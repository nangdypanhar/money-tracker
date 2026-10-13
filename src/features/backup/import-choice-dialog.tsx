"use client";

import { Download } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { BackupFile } from "@/lib/backup/backup";

export type ImportMode = "merge" | "replace";

const COPY: Record<ImportMode, { title: string; body: string; action: string }> = {
  merge: {
    title: "Merge backup?",
    body:
      "Everything on this device is kept and the backup's records are added. If the same record was changed on both " +
      "devices, the newer change wins. Records entered separately on each device are both kept.",
    action: "Merge",
  },
  replace: {
    title: "Replace all data?",
    body: "Everything on this device is deleted and only the backup's data is kept.",
    action: "Replace",
  },
};

/** Confirms importing a validated backup in the chosen mode, with a chance to download this device's data first. */
export function ImportChoiceDialog({
  pending,
  busy,
  onExport,
  onConfirm,
  onCancel,
}: {
  pending: { backup: BackupFile; mode: ImportMode } | null;
  busy: boolean;
  onExport: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = COPY[pending?.mode ?? "merge"];
  const backup = pending?.backup;
  const transactions = backup?.data.transactions.filter((t) => !t.deletedAt).length ?? 0;
  const accounts = backup?.data.accounts.filter((a) => !a.deletedAt).length ?? 0;
  const from = backup?.exportedAt ? ` from ${new Date(backup.exportedAt).toLocaleString()}` : "";

  return (
    <AlertDialog open={!!pending} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>
            The backup{from} has {transactions} transactions and {accounts} accounts. {copy.body} Your PIN and settings
            stay the same.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Button variant="outline" onClick={onExport} disabled={busy} className="h-11 rounded-full">
          <Download /> Download this device&apos;s data first
        </Button>
        <div className="flex flex-col gap-2">
          <AlertDialogAction
            variant={pending?.mode === "replace" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={busy}
            className="h-11 rounded-full"
          >
            {copy.action}
          </AlertDialogAction>
          <AlertDialogCancel onClick={onCancel} className="h-11 rounded-full">
            Cancel
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
