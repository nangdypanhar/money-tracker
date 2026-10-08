"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light / dark / system via a `dark` class on <html>. The choice is a UI preference kept in localStorage. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="moneytrack:theme">
      {children}
    </NextThemesProvider>
  );
}
