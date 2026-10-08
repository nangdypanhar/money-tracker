import type { Account, Category, CategoryKind } from "@/lib/finance/types";
import { DEFAULT_CURRENCY } from "@/lib/money/currency";
import { getMeta } from "./settings";
import { withTransaction } from "./idb";

/** Fixed ids so defaults match across devices (helps future sync merges). */
export const FEES_CATEGORY_ID = "default-expense-fees";
export const DEFAULT_CASH_ACCOUNT_ID = "default-account-cash";

const DEFAULT_CATEGORIES: [id: string, name: string, kind: CategoryKind, color: number, icon: string][] = [
  ["default-expense-housing", "Housing", "expense", 0, "house"],
  ["default-expense-groceries", "Groceries", "expense", 3, "shopping-cart"],
  ["default-expense-foods", "Foods", "expense", 1, "utensils"],
  ["default-expense-health", "Health", "expense", 4, "heart-pulse"],
  ["default-expense-transport", "Transport", "expense", 2, "car"],
  ["default-expense-utilities", "Utilities", "expense", 5, "zap"],
  ["default-expense-shopping", "Shopping", "expense", 0, "shopping-bag"],
  ["default-expense-entertainment", "Entertainment", "expense", 4, "film"],
  ["default-expense-bills", "Bills", "expense", 2, "receipt"],
  [FEES_CATEGORY_ID, "Fees", "expense", 5, "percent"],
  ["default-expense-other", "Other", "expense", 3, "ellipsis"],
  ["default-income-salary", "Salary", "income", 0, "briefcase"],
  ["default-income-investments", "Investments", "income", 1, "trending-up"],
  ["default-income-business", "Business", "income", 3, "store"],
  ["default-income-bonus", "Bonuses", "income", 4, "gift"],
  ["default-income-other", "Other income", "income", 5, "ellipsis"],
];

let seeding: Promise<void> | null = null;

/**
 * First run only: default categories and a Cash account, written atomically.
 * Shared promise + fixed ids make it safe to call twice (React runs effects twice in dev).
 */
export function seedIfNeeded(): Promise<void> {
  seeding ??= seed().catch((error) => {
    seeding = null;
    throw error;
  });
  return seeding;
}

async function seed(): Promise<void> {
  if (await getMeta<boolean>("seeded")) return;

  const now = new Date().toISOString();
  const categories: Category[] = DEFAULT_CATEGORIES.map(([id, name, kind, color, icon]) => ({
    id,
    name,
    kind,
    color,
    icon,
    createdAt: now,
    updatedAt: now,
  }));
  const cash: Account = {
    id: DEFAULT_CASH_ACCOUNT_ID,
    name: "Cash",
    kind: "cash",
    currency: DEFAULT_CURRENCY,
    openingBalance: 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  await withTransaction(["categories", "accounts", "meta"], "readwrite", (tx) => {
    const categoryStore = tx.objectStore("categories");
    for (const c of categories) categoryStore.put(c);
    tx.objectStore("accounts").put(cash);
    tx.objectStore("meta").put({ key: "seeded", value: true });
  });
}
