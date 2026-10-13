"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FormDrawer } from "@/components/app/form";
import { InfoRow } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useData } from "@/features/data/data-provider";
import { backupDate, changesMessage, ImportPreviewBody, type ImportMode } from "@/features/backup/import-preview";
import { type BackupFile, buildBackup, downloadFile, type ImportPreview, mergeBackup, previewImport, restoreBackup } from "@/lib/backup/backup";
import { toLocalDate } from "@/lib/finance/dates";
import type { SnapshotInfo } from "@/lib/sync/supabase";
import { type CloudVault, continueWithVault, downloadCloudBackup, openCloudVault } from "./cloud";
import { useSync } from "./sync-provider";

/**
 * Restore from the cloud with a recovery key: sign in, pick a backup, decrypt + validate, preview, then the
 * user chooses Replace or Merge. Nothing on this device changes until then. A restore is a one-time copy: it never
 * connects this device to that backup. With `reconnectOnly`, it reconnects this device to *its own* backup
 * (keys missing / conflict) without touching local data.
 */
export function RestoreCloudDrawer({
  open,
  onOpenChange,
  reconnectOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reconnectOnly?: boolean;
}) {
  const { refresh } = useData();
  const { state, reload, backUpNow } = useSync();
  const [key, setKey] = useState("");
  const [vault, setVault] = useState<CloudVault | null>(null);
  const [preview, setPreview] = useState<{ snapshot: SnapshotInfo; backup: BackupFile; changes: ImportPreview } | null>(null);
  const [busy, setBusy] = useState(false);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setKey("");
      setVault(null);
      setPreview(null);
    }
  }

  async function step<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await work();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const unlock = () => step(async () => setVault(await openCloudVault(key)));
  const choose = (snapshot: SnapshotInfo) =>
    step(async () => {
      const backup = await downloadCloudBackup(vault!, snapshot);
      setPreview({ snapshot, backup, changes: await previewImport(backup) });
    });

  async function reconnect() {
    await step(async () => {
      // Only this device's own backup: a key for another backup can restore data, never take over backing up.
      if (state?.userId && state.userId !== vault!.userId) {
        throw new Error("That recovery key belongs to a different cloud backup than this device's.");
      }
      await continueWithVault(vault!);
      await reload();
      close(false);
      toast.success("Cloud backup reconnected");
      void backUpNow();
    });
  }

  async function exportFirst() {
    await step(async () => {
      downloadFile(JSON.stringify(await buildBackup(), null, 2), `moneytrack-backup-${toLocalDate(new Date())}.json`, "application/json");
      toast.success("Backup downloaded");
    });
  }

  async function apply(how: ImportMode) {
    await step(async () => {
      if (how === "merge") {
        toast.success(changesMessage(await mergeBackup(preview!.backup)));
      } else {
        await restoreBackup(preview!.backup);
        toast.success("Backup restored");
      }
      // A one-time copy: this device is not connected to that cloud backup, and nothing is uploaded to it.
      // (If this device has its own cloud backup on, the restored data is backed up there as usual.)
      await refresh();
      close(false);
    });
  }

  const thisDevice = state?.deviceId;

  return (
    <FormDrawer open={open} onOpenChange={close} title={reconnectOnly ? "Reconnect cloud backup" : "Restore from cloud"}>
      {!vault && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <label htmlFor="recovery-key" className="text-sm text-muted-foreground">
            Enter the recovery key you saved when you turned on cloud backup.
          </label>
          <Input
            id="recovery-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-…"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-11 rounded-full"
          />
          <Button type="submit" disabled={busy || key.trim().length < 20} className="h-11 rounded-full">
            {busy ? "Checking…" : "Continue"}
          </Button>
          <InfoRow>
            No recovery key, or cloud backup was never on? Then data that was only on a device can&apos;t be recovered
            from the cloud.
          </InfoRow>
        </form>
      )}

      {vault && !preview && (
        <div className="flex flex-col gap-3">
          {reconnectOnly ? (
            <>
              <p className="text-sm text-muted-foreground">
                Your recovery key works. Reconnect to keep backing up this device; its data isn&apos;t changed.
              </p>
              <Button onClick={reconnect} disabled={busy} className="h-11 rounded-full">
                Reconnect this device
              </Button>
            </>
          ) : vault.snapshots.length === 0 ? (
            <InfoRow>This cloud backup has no saved copies yet.</InfoRow>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Choose a backup to preview. Newest first.</p>
              <ul className="flex flex-col gap-2">
                {vault.snapshots.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void choose(s)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border bg-background/40 px-4 py-2.5 text-left text-sm hover:bg-accent disabled:opacity-60"
                    >
                      <span>{backupDate(s.createdAt)}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.deviceId === thisDevice ? "This device" : "Device …" + s.deviceId.slice(-4)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {preview && (
        <div className="flex flex-col gap-4">
          <InfoRow>One-time copy: this device won&apos;t be connected to that cloud backup or upload to it.</InfoRow>
          <ImportPreviewBody
            preview={preview.changes}
            sourceLabel={`Cloud backup from ${backupDate(preview.snapshot.createdAt)}, decrypted and checked`}
            busy={busy}
            onApply={(how) => void apply(how)}
            onExport={() => void exportFirst()}
            onCancel={() => setPreview(null)}
          />
        </div>
      )}
    </FormDrawer>
  );
}
