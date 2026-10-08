"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useEffect } from "react";
import { STATUS_BAR_META_ID, THEME_STORAGE_KEY } from "@/lib/theme";

/** Light / dark / system via a `dark` class on <html>. The choice is a UI preference kept in localStorage. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey={THEME_STORAGE_KEY}>
      <StatusBarColorSync />
      {children}
    </NextThemesProvider>
  );
}

/**
 * The phone's status bar color comes from <meta name="theme-color">. The app owns the only such tag
 * (created by the pre-paint script in layout.tsx; Next renders none, see `viewport`), set to --status-bar.
 *
 * On every change the tag is REPLACED with a new element (not just edited): Android Chrome reliably repaints
 * the bar when a theme-color tag is inserted, while an in-place edit can be missed until a reload.
 * A MutationObserver on <html>'s class runs this the moment next-themes flips `dark`, in the same frame.
 */
function StatusBarColorSync() {
  useEffect(() => {
    const root = document.documentElement;
    let last = "";
    const apply = () => {
      const color = getComputedStyle(root).getPropertyValue("--status-bar").trim();
      if (!color || color === last) return;
      last = color;
      const fresh = document.createElement("meta");
      fresh.name = "theme-color";
      fresh.content = color;
      document.getElementById(STATUS_BAR_META_ID)?.remove();
      fresh.id = STATUS_BAR_META_ID;
      document.head.prepend(fresh);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
