"use client";

import { Copy, Download, KeyRound, Lock, ShieldAlert, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FormDrawer } from "@/components/app/form";
import { InfoRow } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadFile } from "@/lib/backup/backup";
import { generateRecoveryKey } from "@/lib/sync/crypto";
import { enableCloudBackup } from "./cloud";
import { useSync } from "./sync-provider";

type Step = "consent" | "key" | "confirm";

/** Turning cloud backup on: explain and get agreement, show the recovery key, check it was saved. */
export function EnableCloudDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { reload, backUpNow } = useSync();
  const [step, setStep] = useState<Step>("consent");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const lastGroup = recoveryKey.split("-").at(-1) ?? "";
  // Forgiving check: any case, spaces, or dashes; the last group or the whole key. The input itself is never
  // rewritten while typing (that garbles text on Android keyboards).
  const cleaned = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const matches = lastGroup !== "" && (cleaned === lastGroup || cleaned === recoveryKey.replace(/-/g, ""));

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // Don't keep the key around in memory once the drawer is gone.
      setStep("consent");
      setRecoveryKey("");
      setTyped("");
    }
  }

  async function agree() {
    setRecoveryKey(await generateRecoveryKey());
    setStep("key");
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      toast.success("Recovery key copied");
    } catch {
      toast.error("Couldn't copy — write it down or download it instead.");
    }
  }

  async function turnOn() {
    setBusy(true);
    try {
      await enableCloudBackup(recoveryKey);
      await reload();
      close(false);
      toast.success("Cloud backup is on");
      void backUpNow();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't turn on cloud backup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer open={open} onOpenChange={close} title="Cloud backup">
      {step === "consent" && (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex gap-3">
              <Upload className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                An <b className="font-medium">encrypted</b> copy of all your MoneyTrack data is uploaded to our backup server
                (Supabase) whenever it changes, so you can get it back if this device&apos;s data is deleted.
              </span>
            </li>
            <li className="flex gap-3">
              <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                It&apos;s encrypted on this device before it leaves. The server can&apos;t read your amounts, notes, or
                accounts. No email or account sign-up is needed.
              </span>
            </li>
            <li className="flex gap-3">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Next you&apos;ll get a <b className="font-medium">recovery key</b>. It&apos;s the only way to restore the
                backup on a new or reset device.
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-expense" />
              <span>
                If you lose the recovery key and this device&apos;s data, the backup can&apos;t be decrypted by anyone —
                including us.
              </span>
            </li>
          </ul>
          <InfoRow>You can turn this off any time and delete the cloud copies. Without it, the app works fully offline.</InfoRow>
          <Button onClick={agree} className="h-11 rounded-full">
            I agree — continue
          </Button>
          <Button variant="outline" onClick={() => close(false)} className="h-11 rounded-full">
            Not now
          </Button>
        </div>
      )}

      {step === "key" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Save this recovery key somewhere safe outside this phone — a password manager, or written on paper. Anyone
            with it can open your backup.
          </p>
          <p
            aria-label="Recovery key"
            className="rounded-2xl border bg-background/60 p-4 text-center text-lg font-medium tracking-wider break-words tabular-nums"
          >
            {recoveryKey}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={copyKey} className="h-11 rounded-full">
              <Copy /> Copy
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(
                  `MoneyTrack recovery key\n\n${recoveryKey}\n\nKeep this private. You need it to restore your cloud backup.\n`,
                  "moneytrack-recovery-key.txt",
                  "text/plain",
                )
              }
              className="h-11 rounded-full"
            >
              <Download /> Download
            </Button>
          </div>
          <Button onClick={() => setStep("confirm")} className="h-11 rounded-full">
            I saved it
          </Button>
        </div>
      )}

      {step === "confirm" && (
        <div className="flex flex-col gap-4">
          <label htmlFor="key-check" className="text-sm text-muted-foreground">
            To check you saved it, type the <b className="font-medium text-foreground">last 4 characters</b> of your
            recovery key (after the last dash).
          </label>
          <Input
            id="key-check"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 rounded-full text-center text-lg tracking-widest uppercase"
          />
          <Button onClick={turnOn} disabled={busy || !matches} className="h-11 rounded-full">
            {busy ? "Turning on…" : "Turn on cloud backup"}
          </Button>
          <Button variant="outline" onClick={() => setStep("key")} disabled={busy} className="h-11 rounded-full">
            Show the key again
          </Button>
        </div>
      )}
    </FormDrawer>
  );
}
