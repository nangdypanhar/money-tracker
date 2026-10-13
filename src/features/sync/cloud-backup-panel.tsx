"use client";

import { CloudDownload, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { InfoRow, Panel, SectionTitle } from "@/components/finance/primitives";
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
import { Switch } from "@/components/ui/switch";
import { useData } from "@/features/data/data-provider";
import { formatSince, SYNC_STATUS_LABEL } from "@/lib/sync/status";
import { disableCloudBackup } from "./cloud";
import { CloudStatusIcon } from "./cloud-status-icon";
import { EnableCloudDrawer } from "./enable-cloud-drawer";
import { RestoreCloudDrawer } from "./restore-cloud-drawer";
import { useSync } from "./sync-provider";

const RECOVERY_HELP = {
  "keys-missing": "This device no longer has its backup keys. Reconnect with your recovery key.",
  "signed-out": "The backup server didn't accept this device's login. Reconnect with your recovery key.",
  conflict: "The cloud has newer backups for this device than this device made. Reconnect to start a fresh backup chain.",
} as const;

/** Cloud backup on the Backup screen: on/off toggle (with consent), status, back up now, restore. */
export function CloudBackupPanel() {
  const { mode } = useData();
  const { configured, state, status, backUpNow, reload } = useSync();
  const [enableOpen, setEnableOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [restore, setRestore] = useState<null | "restore" | "reconnect">(null);
  const [busy, setBusy] = useState(false);
  const enabled = state?.enabled ?? false;
  const since = formatSince(state?.lastConfirmedAt, new Date());

  if (mode === "demo") return null;

  async function manual() {
    setBusy(true);
    const outcome = await backUpNow();
    setBusy(false);
    if (outcome?.kind === "uploaded" || outcome?.kind === "up-to-date") toast.success("Backed up");
    else if (outcome?.kind === "failed") toast.error(`Backup failed: ${outcome.error}`);
  }

  async function turnOff(deleteCloud: boolean) {
    setBusy(true);
    try {
      await disableCloudBackup(deleteCloud);
      await reload();
      toast.success(deleteCloud ? "Cloud backup off — cloud copies deleted" : "Cloud backup off");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't turn off cloud backup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Cloud backup</SectionTitle>
        <Switch
          aria-label="Cloud backup"
          checked={enabled}
          disabled={!configured || busy || !state}
          onCheckedChange={(on) => (on ? setEnableOpen(true) : setDisableOpen(true))}
        />
      </div>

      {!configured ? (
        <InfoRow>Cloud backup isn&apos;t set up for this app yet.</InfoRow>
      ) : !enabled ? (
        <p className="text-sm text-muted-foreground">
          Off — your data is only on this device. Turn on to keep an encrypted copy in the cloud that you can restore
          with a recovery key.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <p className="flex items-center gap-2 text-sm">
              <CloudStatusIcon status={status} className="size-4" />
              {SYNC_STATUS_LABEL[status]}
            </p>
            {since && status !== "recovery-required" && <p className="pl-6 text-xs text-muted-foreground">Last backup {since}</p>}
          </div>
          {status === "failed" && state?.lastError && <InfoRow>{state.lastError}</InfoRow>}
          {status === "recovery-required" && state?.blocked ? (
            <>
              <InfoRow>{RECOVERY_HELP[state.blocked]}</InfoRow>
              <Button onClick={() => setRestore("reconnect")} className="h-11 rounded-full">
                Reconnect with recovery key
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={manual} disabled={busy || status === "backing-up"} className="h-11 rounded-full">
              <RefreshCw /> {status === "failed" ? "Retry now" : "Back up now"}
            </Button>
          )}
          <InfoRow>
            Encrypted on this device before upload. Closing the app doesn&apos;t guarantee the latest changes are uploaded
            — they go up the next time it&apos;s open.
          </InfoRow>
        </>
      )}

      {configured && (
        <Button variant="outline" onClick={() => setRestore("restore")} className="h-11 rounded-full">
          <CloudDownload /> Restore from cloud
        </Button>
      )}

      <EnableCloudDrawer open={enableOpen} onOpenChange={setEnableOpen} />
      <RestoreCloudDrawer open={restore !== null} onOpenChange={(o) => !o && setRestore(null)} reconnectOnly={restore === "reconnect"} />
      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off cloud backup?</AlertDialogTitle>
            <AlertDialogDescription>
              New changes stop being backed up. You can keep the existing cloud copies (restorable with your recovery
              key) or delete them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <AlertDialogAction onClick={() => void turnOff(false)} className="h-11 rounded-full">
              Turn off, keep cloud copies
            </AlertDialogAction>
            <AlertDialogAction variant="destructive" onClick={() => void turnOff(true)} className="h-11 rounded-full">
              Turn off and delete cloud copies
            </AlertDialogAction>
            <AlertDialogCancel className="h-11 rounded-full">Cancel</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
