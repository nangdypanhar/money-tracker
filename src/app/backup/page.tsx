"use client";

import { Download, Share2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FormDrawer, useConfirm } from "@/components/app/form";
import { ScreenHeader } from "@/components/app/screen-header";
import { InfoRow, Panel, SectionTitle } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { useData } from "@/features/data/data-provider";
import { backupDate, changesMessage, ImportPreviewBody, type ImportMode } from "@/features/backup/import-preview";
import { CloudBackupPanel } from "@/features/sync/cloud-backup-panel";
import { type BackupFile, buildBackup, canShareFiles, downloadFile, eraseAllData, type ImportPreview, mergeBackup, previewImport, restoreBackup, shareFile, validateBackup } from "@/lib/backup/backup";
import { lastBackupLabel } from "@/lib/backup/reminder";
import { getLastBackupAt, getStoragePersistence, setLastBackupAt, type StoragePersistence } from "@/lib/db/storage";
import { restartApp } from "@/lib/db/mode";
import { toLocalDate } from "@/lib/finance/dates";

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export default function BackupPage() {
  const { refresh, mode } = useData();
  const { confirm, dialog } = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ backup: BackupFile; preview: ImportPreview } | null>(null);

  const [lastBackupAt, setLastBackup] = useState<string | undefined>();
  const [persistence, setPersistence] = useState<StoragePersistence>("unsupported");
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    void getLastBackupAt().then(setLastBackup).catch(() => {});
    void getStoragePersistence().then((p) => {
      setPersistence(p);
      setShareSupported(canShareFiles());
    });
  }, []);

  async function exportBackup(how: "download" | "share" = "download") {
    setBusy(true);
    try {
      const content = JSON.stringify(await buildBackup(), null, 2);
      const filename = `moneytrack-backup-${toLocalDate(new Date())}.json`;
      if (how === "share") {
        if (!(await shareFile(content, filename, "application/json"))) return;
      } else {
        downloadFile(content, filename, "application/json");
      }
      if (mode === "real") {
        const now = new Date().toISOString();
        await setLastBackupAt(now);
        setLastBackup(now);
      }
      toast.success(how === "share" ? "Backup shared" : "Backup downloaded");
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

    try {
      setPending({ backup: result.backup, preview: await previewImport(result.backup) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read this device's data to compare.");
    }
  }

  async function applyImport(backup: BackupFile, how: ImportMode) {
    setBusy(true);
    try {
      if (how === "merge") {
        toast.success(changesMessage(await mergeBackup(backup)));
      } else {
        await restoreBackup(backup);
        toast.success("Backup restored");
      }
      await refresh();
      setPending(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed — nothing was changed.");
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
      <CloudBackupPanel />

      <Panel className="flex flex-col gap-3">
        <SectionTitle>Export</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Download all your accounts, transactions, budgets, and goals as a JSON file. Keep it somewhere safe — it isn&apos;t
          encrypted.
        </p>
        <Button onClick={() => exportBackup()} disabled={busy} className="h-11 rounded-full">
          <Download /> Download backup
        </Button>
        {shareSupported && (
          <Button variant="outline" onClick={() => exportBackup("share")} disabled={busy} className="h-11 rounded-full">
            <Share2 /> Save to Files or Drive
          </Button>
        )}
        {mode === "real" && <InfoRow>Last file backup: {lastBackupLabel(lastBackupAt, new Date())}</InfoRow>}
        {mode === "real" && persistence !== "unsupported" && (
          <InfoRow>
            {persistence === "persisted"
              ? "Storage is protected: the browser won't clear this data on its own."
              : "This browser may clear app data when space is low — keep a recent backup."}
          </InfoRow>
        )}
      </Panel>

      <Panel className="flex flex-col gap-3">
        <SectionTitle>Import</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Bring in a MoneyTrack backup, for example from your phone. The file is checked first; if anything is wrong,
          nothing is changed.
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
          <Upload /> Import backup file
        </Button>
        <InfoRow>You&apos;ll see exactly what it adds or changes before anything is saved.</InfoRow>
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
      <FormDrawer open={!!pending} onOpenChange={(open) => !open && !busy && setPending(null)} title="Import backup">
        {pending && (
          <ImportPreviewBody
            preview={pending.preview}
            sourceLabel={`Backup file${pending.backup.exportedAt ? ` from ${backupDate(pending.backup.exportedAt)}` : ""}`}
            busy={busy}
            onApply={(how) => void applyImport(pending.backup, how)}
            onExport={() => exportBackup()}
            onCancel={() => setPending(null)}
          />
        )}
      </FormDrawer>
    </main>
  );
}
