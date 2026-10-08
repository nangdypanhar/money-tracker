"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Field, useConfirm } from "@/components/app/form";
import { ScreenHeader } from "@/components/app/screen-header";
import { InfoRow, Panel, SectionTitle } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/features/data/data-provider";
import { useLock } from "@/features/security/lock-provider";
import { switchDataMode } from "@/lib/db/mode";
import { deleteSetting, setSetting } from "@/lib/db/settings";
import { hashPin, isPinSupported, isValidPin, PIN_MAX_LENGTH, PIN_MIN_LENGTH, verifyPin } from "@/lib/security/pin";

const AUTO_LOCK = [
  { value: "0", label: "Immediately" },
  { value: "60", label: "After 1 minute" },
  { value: "300", label: "After 5 minutes" },
  { value: "900", label: "After 15 minutes" },
];

export default function SecurityPage() {
  const { security, reloadSecurity } = useLock();
  const { mode } = useData();
  const { confirm, dialog } = useConfirm();
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);

  const pinInput = (value: string, onChange: (v: string) => void, id: string, label: string) => (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_MAX_LENGTH}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="h-11 rounded-xl tracking-[0.4em]"
      />
    </Field>
  );

  async function checkCurrent(): Promise<boolean> {
    if (!security) return true;
    if (await verifyPin(current, security)) return true;
    toast.error("Current PIN is wrong.");
    return false;
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPin(pin)) return toast.error(`PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`);
    if (pin !== repeat) return toast.error("PINs don't match.");
    setBusy(true);
    try {
      if (!(await checkCurrent())) return;
      const hashed = await hashPin(pin);
      await setSetting("security", { ...hashed, autoLockSeconds: security?.autoLockSeconds ?? 60 });
      await reloadSecurity();
      setCurrent("");
      setPin("");
      setRepeat("");
      toast.success(security ? "PIN changed" : "PIN lock turned on");
    } finally {
      setBusy(false);
    }
  }

  async function removePin() {
    if (!(await checkCurrent())) return;
    if (!(await confirm("Turn off PIN lock?", "Anyone with this device can open MoneyTrack.", "Turn off"))) return;
    await deleteSetting("security");
    await reloadSecurity();
    setCurrent("");
    toast.success("PIN lock turned off");
  }

  async function setAutoLock(value: string) {
    if (!security) return;
    await setSetting("security", { ...security, autoLockSeconds: Number(value) });
    await reloadSecurity();
  }

  return (
    <main className="flex flex-col gap-5 px-4">
      <ScreenHeader title="Security" back className="px-0" />

      {mode === "demo" && (
        <Panel className="flex flex-col gap-3">
          <SectionTitle>You&apos;re in demo mode</SectionTitle>
          <p className="text-sm text-muted-foreground">The PIN protects your own data. Switch back to set or change it.</p>
          <Button className="h-11 rounded-full" onClick={() => switchDataMode("real")}>
            Switch to my data
          </Button>
        </Panel>
      )}

      {mode === "demo" ? null : !isPinSupported() ? (
        <Panel className="flex flex-col gap-2">
          <SectionTitle>PIN lock unavailable here</SectionTitle>
          <p className="text-sm text-muted-foreground">
            Browsers only allow the secure crypto the PIN lock needs on HTTPS or localhost. Open MoneyTrack over HTTPS
            (or on this computer at localhost) to turn it on.
          </p>
        </Panel>
      ) : (
      <Panel className="flex flex-col gap-4">
        <SectionTitle>{security ? "Change PIN" : "Set up a PIN lock"}</SectionTitle>
        <form onSubmit={savePin} className="flex flex-col gap-3">
          {security && pinInput(current, setCurrent, "pin-current", "Current PIN")}
          {pinInput(pin, setPin, "pin-new", security ? "New PIN" : "PIN")}
          {pinInput(repeat, setRepeat, "pin-repeat", "Repeat PIN")}
          <Button type="submit" disabled={busy} className="h-11 rounded-full">
            {security ? "Change PIN" : "Turn on PIN lock"}
          </Button>
        </form>
        {security && (
          <Button variant="ghost" className="h-11 rounded-full text-expense" onClick={removePin}>
            Turn off PIN lock{!current && " (enter current PIN above)"}
          </Button>
        )}
      </Panel>
      )}

      {mode === "real" && security && isPinSupported() && (
        <Panel className="flex flex-col gap-3">
          <SectionTitle>Auto-lock</SectionTitle>
          <Select value={String(security.autoLockSeconds)} onValueChange={setAutoLock}>
            <SelectTrigger className="h-11! w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTO_LOCK.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">How long MoneyTrack can stay in the background before asking for the PIN again.</p>
        </Panel>
      )}

      <InfoRow>
        The PIN lock hides the app from other people using this device. Your data itself isn&apos;t encrypted yet, and a
        forgotten PIN can&apos;t be recovered — keep a backup.
      </InfoRow>
      {dialog}
    </main>
  );
}
