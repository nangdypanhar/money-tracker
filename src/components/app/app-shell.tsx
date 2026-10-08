"use client";

import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { DataProvider, useData } from "@/features/data/data-provider";
import { LockProvider } from "@/features/security/lock-provider";
import { TransactionSheetProvider } from "@/features/transactions/transaction-sheet";
import { BottomNav } from "./bottom-nav";
import { DemoBanner } from "./demo-banner";

export function AppShell({ children }: { children: React.ReactNode }) {
  useServiceWorker();
  return (
    <DataProvider>
      <LockProvider>
        <TransactionSheetProvider>
          {/* Phone-width column on larger screens, matching the sample's mobile layout */}
          <div className="header-glow relative mx-auto min-h-dvh w-full max-w-md overflow-x-clip pb-28">
            <DataGate>{children}</DataGate>
          </div>
          <BottomNav />
        </TransactionSheetProvider>
      </LockProvider>
      <Toaster position="top-center" />
    </DataProvider>
  );
}

function DataGate({ children }: { children: React.ReactNode }) {
  const { ready, error } = useData();
  if (error) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-medium">Couldn&apos;t open your data</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }
  if (!ready) return null;
  return (
    <>
      <DemoBanner />
      {children}
    </>
  );
}

/** Offline support. Only in production so dev builds aren't served stale from cache. */
function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline caching is an enhancement; the app works without it.
    });
  }, []);
}
