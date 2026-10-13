"use client";

/**
 * Runs cloud backups. Triggers (each only *attempts* a backup; correctness never depends on one finishing):
 * a debounced local change, app hidden/closed (best effort), app opened/foregrounded, back online, and
 * "Back up now". One upload at a time across tabs (Web Locks); failures retry with back-off while open.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/features/data/data-provider";
import { onLocalChange } from "@/lib/db/idb";
import { newId } from "@/lib/id";
import { backUpOnce, RemoteError, retryDelayMs, type SyncOutcome, type SyncRemote, type SyncState, type SyncStatus, syncStatus } from "@/lib/sync/engine";
import { getDeviceKeys, idbSyncLocal, readSyncState } from "@/lib/sync/local-idb";
import { cloudConfig, SupabaseBackupClient } from "@/lib/sync/supabase";

const DEBOUNCE_MS = 5_000;
const MIN_AUTO_INTERVAL_MS = 30_000;
const LOCK_NAME = "moneytrack-cloud-backup";
/** Used only when there are no keys; the engine stops ("recovery required") before calling it. */
const NO_REMOTE: SyncRemote = { commit: () => Promise.reject(new RemoteError("No backup keys on this device.", "auth")) };

interface SyncContextValue {
  /** The app has Supabase settings (cloud backup can be offered). */
  configured: boolean;
  state: SyncState | null;
  status: SyncStatus;
  backUpNow: () => Promise<SyncOutcome | null>;
  /** Re-read the state after enabling/disabling/restoring. */
  reload: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { mode, ready } = useData();
  const configured = useMemo(() => cloudConfig() !== null, []);
  const active = configured && mode === "real" && ready;
  const [state, setState] = useState<SyncState | null>(null);
  const [running, setRunning] = useState(false);
  const client = useRef<{ email: string; client: SupabaseBackupClient } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoRun = useRef(0);
  /** Latest `run`, for the retry timer (set in an effect below). */
  const retry = useRef<() => void>(() => {});

  const reload = useCallback(async () => {
    if (!active) return;
    setState(await readSyncState());
  }, [active]);

  const run = useCallback(
    async ({ keepalive = false }: { keepalive?: boolean } = {}): Promise<SyncOutcome | null> => {
      const config = cloudConfig();
      if (!active || !config) return null;
      const current = await readSyncState();
      setState(current);
      if (!current.enabled) return { kind: "disabled" };

      const attempt = async (): Promise<SyncOutcome> => {
        const keys = await getDeviceKeys();
        if (keys && client.current?.email !== keys.credentials.email) {
          client.current = { email: keys.credentials.email, client: new SupabaseBackupClient(config, keys.credentials) };
        }
        setRunning(true);
        try {
          return await backUpOnce({
            local: idbSyncLocal,
            remote: keys && client.current ? client.current.client : NO_REMOTE,
            keys: keys ? { dek: keys.dek, userId: keys.userId } : null,
            newId,
            keepalive,
          });
        } finally {
          setRunning(false);
        }
      };

      let outcome: SyncOutcome | null = null;
      if (typeof navigator !== "undefined" && navigator.locks) {
        // Another tab already uploading the same database: let it finish instead of racing.
        await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
          if (lock) outcome = await attempt();
        });
      } else {
        outcome = await attempt();
      }

      const after = await readSyncState();
      setState(after);
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const failed = (outcome as SyncOutcome | null)?.kind === "failed";
      if (failed) timer.current = setTimeout(() => retry.current(), retryDelayMs(after.failures));
      return outcome;
    },
    [active],
  );

  useEffect(() => {
    retry.current = () => void run();
  }, [run]);

  /** Automatic trigger: debounced, and no more than one upload per MIN_AUTO_INTERVAL_MS. */
  const schedule = useCallback(
    (delay = DEBOUNCE_MS) => {
      if (timer.current) clearTimeout(timer.current);
      const wait = Math.max(delay, lastAutoRun.current + MIN_AUTO_INTERVAL_MS - Date.now());
      timer.current = setTimeout(() => {
        lastAutoRun.current = Date.now();
        void run();
      }, wait);
    },
    [run],
  );

  useEffect(() => {
    if (!active) return;
    const opened = setTimeout(() => void run(), 0); // app opened: retry anything pending

    const offChange = onLocalChange(() => {
      void reload();
      schedule();
    });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void run({ keepalive: true }); // best effort only
      else void run();
    };
    const onPageHide = () => void run({ keepalive: true });
    const onOnline = () => void run();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(opened);
      offChange();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("online", onOnline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, run, reload, schedule]);

  const value = useMemo<SyncContextValue>(
    () => ({
      configured,
      state,
      status: state ? syncStatus(state, running) : "local-only",
      backUpNow: () => run(),
      reload,
    }),
    [configured, state, running, run, reload],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync must be used inside SyncProvider");
  return value;
}
