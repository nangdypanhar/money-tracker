"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FormDrawer } from "@/components/app/form";
import { InfoRow, Segmented } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useData } from "@/features/data/data-provider";
import { type BackupFile, buildBackup, downloadFile, mergeBackup, restoreBackup } from "@/lib/backup/backup";
import { formatDate, formatTime12, toLocalDate, toLocalTime } from "@/lib/finance/dates";
import type { SnapshotInfo } from "@/lib/sync/supabase";
import { type CloudVault, continueWithVault, downloadCloudBackup, openCloudVault } from "./cloud";
import { useSync } from "./sync-provider";

const live = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter((r) => !r.deletedAt).length;

function when(iso: string) {
  const d = new Date(iso);
  return `${formatDate(toLocalDate(d))}, ${formatTime12(toLocalTime(d))}`;
}

/**
 * Restore from the cloud with a recovery key: sign in, pick a backup, decrypt + validate, preview, then the
 * user chooses Replace or Merge. Nothing on this device changes until then. With `reconnectOnly`, it just
 * reconnects this device (keys missing / conflict) without touching local data.
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
  const [preview, setPreview] = useState<{ snapshot: SnapshotInfo; backup: BackupFile } | null>(null);
  const [keepBackingUp, setKeepBackingUp] = useState("yes");
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
    step(async () => setPreview({ snapshot, backup: await downloadCloudBackup(vault!, snapshot) }));

  async function reconnect() {
    await step(async () => {
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

  async function apply(how: "merge" | "replace") {
    await step(async () => {
      if (how === "merge") {
        const { added, updated } = await mergeBackup(preview!.backup);
        toast.success(`Merged: ${added} added, ${updated} updated`);
      } else {
        await restoreBackup(preview!.backup);
        toast.success("Backup restored");
      }
      if (keepBackingUp === "yes" && !(state?.enabled && state.userId === vault!.userId)) await continueWithVault(vault!);
      await refresh();
      await reload();
      close(false);
      if (keepBackingUp === "yes") void backUpNow();
    });
  }

  const thisDevice = state?.deviceId;
  const data = preview?.backup.data;

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
                      <span>{when(s.createdAt)}</span>
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

      {preview && data && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Backup from {when(preview.snapshot.createdAt)} — decrypted and checked. It has:
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Transactions", live(data.transactions)],
              ["Accounts", live(data.accounts)],
              ["Budgets", live(data.budgets)],
              ["Goals", live(data.goals)],
            ].map(([label, count]) => (
              <li key={label} className="rounded-2xl border bg-background/40 px-4 py-2.5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-medium tabular-nums">{count}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">Keep backing up this device to this cloud backup?</p>
            <Segmented value={keepBackingUp} onChange={setKeepBackingUp} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
          </div>
          <Button variant="outline" onClick={exportFirst} disabled={busy} className="h-11 rounded-full">
            <Download /> Download this device&apos;s data first
          </Button>
          <InfoRow>Merge keeps this device&apos;s data and adds the backup&apos;s; for the same record, the newer change wins.</InfoRow>
          <Button onClick={() => void apply("merge")} disabled={busy} className="h-11 rounded-full">
            Merge
          </Button>
          <InfoRow>Replace deletes this device&apos;s data and keeps only the backup.</InfoRow>
          <Button variant="destructive" onClick={() => void apply("replace")} disabled={busy} className="h-11 rounded-full">
            Replace
          </Button>
          <Button variant="outline" onClick={() => setPreview(null)} disabled={busy} className="h-11 rounded-full">
            Back
          </Button>
        </div>
      )}
    </FormDrawer>
  );
}
