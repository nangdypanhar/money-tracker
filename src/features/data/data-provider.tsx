"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  accountsRepo,
  budgetsRepo,
  categoriesRepo,
  goalEntriesRepo,
  goalsRepo,
  transactionsRepo,
} from "@/lib/db/repositories";
import { type DataMode, getDataMode } from "@/lib/db/mode";
import { seedIfNeeded } from "@/lib/db/seed";
import { type AppSettings, DEFAULT_APP_SETTINGS, getSetting } from "@/lib/db/settings";
import { type MonthKey, monthKey } from "@/lib/finance/dates";
import { seedDemoIfNeeded } from "./demo-data";
import type { Account, Budget, Category, Goal, GoalEntry, Transaction } from "@/lib/finance/types";

export interface AppData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  goalEntries: GoalEntry[];
  settings: AppSettings;
}

interface DataContextValue {
  data: AppData;
  ready: boolean;
  error: Error | null;
  /** Re-read everything from IndexedDB after a write. */
  refresh: () => Promise<void>;
  /** Month shared by the budget / breakdown / report / history screens. */
  month: MonthKey;
  setMonth: (month: MonthKey) => void;
  accountById: Map<string, Account>;
  categoryById: Map<string, Category>;
  /** Which database is open: the user's real data or the demo. */
  mode: DataMode;
}

const EMPTY: AppData = {
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  goalEntries: [],
  settings: DEFAULT_APP_SETTINGS,
};

const DataContext = createContext<DataContextValue | null>(null);

async function loadAll(): Promise<AppData> {
  // Live records only; soft-deleted ones are kept in IndexedDB for backup/sync.
  const [accounts, categories, transactions, budgets, goals, goalEntries, settings] = await Promise.all([
    accountsRepo.list(),
    categoriesRepo.list(),
    transactionsRepo.list(),
    budgetsRepo.list(),
    goalsRepo.list(),
    goalEntriesRepo.list(),
    getSetting("app"),
  ]);
  return {
    accounts: accounts.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name)),
    categories: categories.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    transactions: transactions.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.time ?? "").localeCompare(a.time ?? "") ||
        b.createdAt.localeCompare(a.createdAt),
    ),
    budgets,
    goals: goals.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    goalEntries: goalEntries.sort((a, b) => b.date.localeCompare(a.date)),
    settings: { ...DEFAULT_APP_SETTINGS, ...settings },
  };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [month, setMonth] = useState<MonthKey>(() => monthKey(new Date()));
  const [mode] = useState<DataMode>(() => (typeof window === "undefined" ? "real" : getDataMode()));

  const refresh = useCallback(async () => {
    try {
      setData(await loadAll());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedIfNeeded();
        await seedDemoIfNeeded();
        const loaded = await loadAll();
        if (!cancelled) setData(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      ready,
      error,
      refresh,
      month,
      setMonth,
      accountById: new Map(data.accounts.map((a) => [a.id, a])),
      categoryById: new Map(data.categories.map((c) => [c.id, c])),
      mode,
    }),
    [data, ready, error, refresh, month, mode],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
