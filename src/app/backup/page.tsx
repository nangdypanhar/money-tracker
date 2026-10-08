"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/app/form";
import { ScreenHeader } from "@/components/app/screen-header";
import { InfoRow, Panel, SectionTitle } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { useData } from "@/features/data/data-provider";
import { buildBackup, downloadFile, eraseAllData, restoreBackup, validateBackup } from "@/lib/backup/backup";
import { restartApp } from "@/lib/db/mode";
import { toLocalDate } from "@/lib/finance/dates";

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export default function BackupPage() {
  const { refresh, mode } = useData();
  const { confirm, dialog } = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function exportBackup() {
    setBusy(true);
    try {
      const backup = await buildBackup();
      downloadFile(JSON.stringify(backup, null, 2), `moneytrack-backup-${toLocalDate(new Date())}.json`, "application/json");
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(file: File) {
    if (file.size > MAX_BACKUP_BYTES) return toast.error("That file is too large to be a MoneyTrack backup.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return toast.error("That file isn't valid JSON.");
    }
    const result = validateBackup(parsed);
    if (!result.ok) return toast.error(result.error);

    const { data, exportedAt } = result.backup;
    const ok = await confirm(
      "Replace all data?",
      `This replaces everything on this device with the backup${exportedAt ? ` from ${new Date(exportedAt).toLocaleString()}` : ""} ` +
        `(${data.transactions.filter((t) => !t.deletedAt).length} transactions, ${data.accounts.filter((a) => !a.deletedAt).length} accounts). ` +
        "Export a backup first if you want to keep the current data. Your PIN stays the same.",
      "Replace",
    );
    if (!ok) return;

    setBusy(true);
    try {
      await restoreBackup(result.backup);
      await refresh();
      toast.success("Backup restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed — nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  async function erase() {
    const ok = await confirm(
      mode === "demo" ? "Erase demo data?" : "Erase all your data?",
      mode === "demo"
        ? "The demo will start again with fresh sample data."
        : "Every account, transaction, budget, and goal on this device will be deleted. This can't be undone — export a backup first if you might need it. Your PIN stays.",
      "Erase",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await eraseAllData();
      restartApp();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erase failed — nothing was changed.");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-5 px-4">
      <ScreenHeader title="Backup & restore" back className="px-0" />
      {mode === "demo" && <InfoRow>You&apos;re in demo mode — export, restore, and erase here only affect the demo.</InfoRow>}

      <Panel className="flex flex-col gap-3">
        <SectionTitle>Export</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Download all your accounts, transactions, budgets, and goals as a JSON file. Keep it somewhere safe — it isn&apos;t
          encrypted.
        </p>
        <Button onClick={exportBackup} disabled={busy} className="h-11 rounded-full">
          <Download /> Download backup
        </Button>
      </Panel>

      <Panel className="flex flex-col gap-3">
        <SectionTitle>Restore</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Import a MoneyTrack backup. The file is checked first; if anything is wrong, nothing is changed.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importBackup(file);
          }}
        />
        <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy} className="h-11 rounded-full">
          <Upload /> Choose backup file
        </Button>
        <InfoRow>Restoring replaces the data on this device.</InfoRow>
      </Panel>

      <Panel className="flex flex-col gap-3 border-expense/30">
        <SectionTitle>Erase all data</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Start fresh: deletes every account, transaction, budget, and goal{mode === "demo" ? " in the demo" : " on this device"}.
          Default categories and a Cash account come back automatically.
        </p>
        <Button variant="destructive" onClick={erase} disabled={busy} className="h-11 rounded-full">
          Erase all data
        </Button>
      </Panel>
      {dialog}
    </main>
  );
}
