"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

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
 * The phone's status bar color comes from <meta name="theme-color">. Its default media queries follow the
 * *phone's* light/dark setting, so when the user picks a different theme in the app we overwrite every
 * theme-color tag with the app's own --status-bar color.
 */
function StatusBarColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = getComputedStyle(document.documentElement).getPropertyValue("--status-bar").trim();
    if (!color) return;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.removeAttribute("media");
      meta.content = color;
    }
  }, [resolvedTheme]);
  return null;
}
