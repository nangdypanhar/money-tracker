"use client";

import { Delete, LockKeyhole } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getSetting, type SecuritySettings, setSetting } from "@/lib/db/settings";
import { isPinSupported, lockoutSeconds, PIN_MAX_LENGTH, PIN_MIN_LENGTH, verifyPin } from "@/lib/security/pin";
import { cn } from "@/lib/utils";

interface LockContextValue {
  security: SecuritySettings | null;
  /** Re-read security settings after they change. */
  reloadSecurity: () => Promise<void>;
  lockNow: () => void;
}

const LockContext = createContext<LockContextValue | null>(null);

export function useLock() {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error("useLock must be used inside <LockProvider>");
  return ctx;
}

const FAILED_KEY = "moneytrack:failed-pin";

/** Failed-attempt count survives reloads so the delay can't be skipped by refreshing. */
function readFailed(): { count: number; at: number } {
  try {
    return JSON.parse(sessionStorage.getItem(FAILED_KEY) ?? "") as { count: number; at: number };
  } catch {
    return { count: 0, at: 0 };
  }
}

function writeFailed(value: { count: number; at: number }) {
  try {
    sessionStorage.setItem(FAILED_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable: the in-memory delay still applies.
  }
}

/** Covers the app with a PIN pad on launch and after the app has been in the background. */
export function LockProvider({ children }: { children: React.ReactNode }) {
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const reloadSecurity = useCallback(async () => {
    setSecurity((await getSetting("security")) ?? null);
  }, []);

  useEffect(() => {
    getSetting("security")
      .then((s) => {
        setSecurity(s ?? null);
        setLocked(!!s);
      })
      .catch(() => setSecurity(null))
      .finally(() => setChecked(true));
  }, []);

  useEffect(() => {
    if (!security) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current !== null) {
        if (Date.now() - hiddenAt.current >= security.autoLockSeconds * 1000) setLocked(true);
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [security]);

  const lockNow = useCallback(() => setLocked(true), []);

  return (
    <LockContext.Provider value={{ security, reloadSecurity, lockNow }}>
      {/* Don't render app content until we know whether a PIN is required. */}
      {checked && !(locked && security) ? children : null}
      {checked && locked && security && <LockScreen security={security} onUnlock={() => setLocked(false)} onLearnLength={reloadSecurity} />}
    </LockContext.Provider>
  );
}

function LockScreen({
  security,
  onUnlock,
  onLearnLength,
}: {
  security: SecuritySettings;
  onUnlock: () => void;
  onLearnLength: () => Promise<void>;
}) {
  const pinLength = security.pinLength;
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const failed = readFailed();
  const waitUntil = failed.at + lockoutSeconds(failed.count) * 1000;
  const waiting = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  useEffect(() => {
    if (waiting <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [waiting]);

  const submit = async (value: string) => {
    if (value.length < PIN_MIN_LENGTH || checking || waiting > 0) return;
    if (!isPinSupported()) {
      setError("Open MoneyTrack over HTTPS or localhost to unlock");
      return;
    }
    setChecking(true);
    const ok = await verifyPin(value, security);
    setChecking(false);
    if (ok) {
      writeFailed({ count: 0, at: 0 });
      // PIN set before auto-unlock existed: remember its length so next time it unlocks on the last digit.
      if (!pinLength) void setSetting("security", { ...security, pinLength: value.length }).then(onLearnLength);
      onUnlock();
      return;
    }
    const next = { count: readFailed().count + 1, at: Date.now() };
    writeFailed(next);
    setNow(Date.now());
    setPin("");
    setError("Wrong PIN");
  };

  const press = (digit: string) => {
    if (waiting > 0 || checking || pin.length >= (pinLength ?? PIN_MAX_LENGTH)) return;
    setError(null);
    const next = pin + digit;
    setPin(next);
    // Unlock as soon as the last digit is in — no OK needed.
    if (pinLength && next.length === pinLength) void submit(next);
  };

  // Physical keyboard: digits, Backspace, Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") void submit(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="header-glow fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background px-6">
      <div className="flex flex-col items-center gap-3">
        <span className="grid size-14 place-items-center rounded-full border bg-card">
          <LockKeyhole className="size-6" />
        </span>
        <h1 className="text-lg font-medium">Enter your PIN</h1>
        <div
          className={cn("flex h-4 gap-2.5", checking && "animate-pulse")}
          aria-live="polite"
          aria-label={`${pin.length} digits entered`}
        >
          {Array.from({ length: pinLength ?? Math.max(PIN_MIN_LENGTH, pin.length) }, (_, i) => (
            <span key={i} className={cn("size-3 rounded-full border border-ring", i < pin.length && "bg-primary")} />
          ))}
        </div>
        <p className="h-4 text-xs text-expense" role="alert">
          {waiting > 0 ? `Too many attempts. Try again in ${waiting}s` : error}
        </p>
      </div>

      <div className="grid w-full max-w-64 grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <PadButton key={d} onClick={() => press(d)}>
            {d}
          </PadButton>
        ))}
        <PadButton onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete digit">
          <Delete className="size-5" />
        </PadButton>
        <PadButton onClick={() => press("0")}>0</PadButton>
        {/* OK always works; with a known PIN length it also unlocks automatically on the last digit. */}
        <PadButton
          onClick={() => submit(pin)}
          disabled={pin.length < (pinLength ?? PIN_MIN_LENGTH) || waiting > 0 || checking}
          className="bg-primary text-primary-foreground text-sm"
        >
          {checking ? "…" : "OK"}
        </PadButton>
      </div>
    </div>
  );
}

function PadButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "grid aspect-square place-items-center rounded-full border bg-card text-xl font-medium transition-colors hover:bg-accent disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
