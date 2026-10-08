"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/** Chromium's install prompt event (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaContextValue {
  /** Android/desktop Chromium offered an install prompt we can show. */
  canInstall: boolean;
  install: () => Promise<void>;
  /** Running as an installed app (home-screen icon). */
  isInstalled: boolean;
  /** iPhone/iPad: install is manual via Share → Add to Home Screen. */
  isIos: boolean;
  /** Installing needs HTTPS (or localhost). */
  isSecure: boolean;
  version: string;
}

const PwaContext = createContext<PwaContextValue | null>(null);

export function usePwa() {
  const ctx = useContext(PwaContext);
  if (!ctx) throw new Error("usePwa must be used inside <PwaProvider>");
  return ctx;
}

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [env, setEnv] = useState({ isInstalled: false, isIos: false, isSecure: true });

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // One-time read of browser capabilities after mount (they don't exist during server render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv({ isInstalled: standalone, isIos: ios, isSecure: window.isSecureContext });

    const onPrompt = (event: Event) => {
      event.preventDefault(); // show our own Install button instead of the mini-infobar
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setEnv((e) => ({ ...e, isInstalled: true }));
      toast.success("MoneyTrack installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Offline support. Production only so dev builds aren't served stale from cache.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      // First install also fires this; only an *update* needs a reload.
      if (!hadController) return;
      toast("New version ready", {
        duration: Infinity,
        action: { label: "Reload", onClick: () => window.location.reload() },
      });
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.register(`/sw.js?v=${VERSION}`).catch(() => {
      // Offline caching is an enhancement; the app works without it.
    });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }, [promptEvent]);

  const value = useMemo<PwaContextValue>(
    () => ({ canInstall: !!promptEvent, install, ...env, version: VERSION }),
    [promptEvent, install, env],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}
