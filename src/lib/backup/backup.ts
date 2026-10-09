/**
 * Backup file format and restore. See .claude/skills/local-data/SKILL.md §4.
 * Restore validates everything first and then replaces data in one IndexedDB transaction.
 */
import {
  accountsRepo,
  budgetsRepo,
  categoriesRepo,
  goalEntriesRepo,
  goalsRepo,
  shoppingItemsRepo,
  shoppingListsRepo,
  transactionsRepo,
} from "@/lib/db/repositories";
import { type AppSettings, getSetting, normalizeAppSettings } from "@/lib/db/settings";
import { withTransaction } from "@/lib/db/idb";
import type { Account, Budget, Category, Goal, GoalEntry, ShoppingItem, ShoppingList, Transaction } from "@/lib/finance/types";
import { isCurrencyCode } from "@/lib/money/currency";

/** v2 added `shoppingItems`; v3 added `shoppingLists`. */
export const BACKUP_SCHEMA_VERSION = 3;

export interface BackupData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  goalEntries: GoalEntry[];
  shoppingItems: ShoppingItem[];
  shoppingLists: ShoppingList[];
  /** App preferences only; the PIN is never exported. */
  settings: AppSettings;
}

export interface BackupFile {
  app: "moneytrack";
  schemaVersion: number;
  exportedAt: string;
  encrypted: false;
  data: BackupData;
}

export async function buildBackup(): Promise<BackupFile> {
  // Includes soft-deleted records so restore (and later sync) stays faithful.
  const [accounts, categories, transactions, budgets, goals, goalEntries, shoppingItems, shoppingLists, settings] = await Promise.all([
    accountsRepo.listIncludingDeleted(),
    categoriesRepo.listIncludingDeleted(),
    transactionsRepo.listIncludingDeleted(),
    budgetsRepo.listIncludingDeleted(),
    goalsRepo.listIncludingDeleted(),
    goalEntriesRepo.listIncludingDeleted(),
    shoppingItemsRepo.listIncludingDeleted(),
    shoppingListsRepo.listIncludingDeleted(),
    getSetting("app"),
  ]);
  return {
    app: "moneytrack",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    encrypted: false,
    data: {
      accounts,
      categories,
      transactions,
      budgets,
      goals,
      goalEntries,
      shoppingItems,
      shoppingLists,
      settings: normalizeAppSettings(settings),
    },
  };
}

export function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ValidationResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isAmount = (v: unknown, allowNegative = false): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && (allowNegative || v >= 0);
const isDate = (v: unknown) => isString(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);

function checkBase(r: Record<string, unknown>): boolean {
  return isString(r.id) && isString(r.createdAt) && isString(r.updatedAt) && (r.deletedAt === undefined || isString(r.deletedAt));
}

/** Validate an untrusted parsed JSON value. Nothing is written here. */
export function validateBackup(json: unknown): ValidationResult {
  const fail = (error: string): ValidationResult => ({ ok: false, error });

  if (!isObject(json) || json.app !== "moneytrack") return fail("This isn't a MoneyTrack backup file.");
  if (typeof json.schemaVersion !== "number") return fail("The backup has no version number.");
  if (json.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return fail("This backup was made by a newer version of MoneyTrack. Update the app and try again.");
  }
  if (json.encrypted) return fail("Encrypted backups aren't supported yet.");
  if (!isObject(json.data)) return fail("The backup has no data.");
  // Upgrade older backups step by step: v1 had no shopping list, v2 had no named lists.
  let data: Record<string, unknown> = json.data;
  if (json.schemaVersion < 2) data = { ...data, shoppingItems: [] };
  if (json.schemaVersion < 3) data = { ...data, shoppingLists: [] };

  const lists = ["accounts", "categories", "transactions", "budgets", "goals", "goalEntries", "shoppingItems", "shoppingLists"] as const;
  for (const key of lists) {
    if (!Array.isArray(data[key])) return fail(`The backup is missing "${key}".`);
    if (!(data[key] as unknown[]).every((r) => isObject(r) && checkBase(r))) return fail(`Some ${key} records are malformed.`);
  }

  const accounts = data.accounts as Record<string, unknown>[];
  const categories = data.categories as Record<string, unknown>[];
  const transactions = data.transactions as Record<string, unknown>[];
  const budgets = data.budgets as Record<string, unknown>[];
  const goals = data.goals as Record<string, unknown>[];
  const goalEntries = data.goalEntries as Record<string, unknown>[];
  const shoppingItems = data.shoppingItems as Record<string, unknown>[];
  const shoppingLists = data.shoppingLists as Record<string, unknown>[];
  const shoppingListIds = new Set(shoppingLists.map((l) => l.id));

  const accountIds = new Set(accounts.map((a) => a.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  const goalIds = new Set(goals.map((g) => g.id));

  for (const a of accounts) {
    if (!isString(a.name) || !isString(a.currency) || !isCurrencyCode(a.currency) || !isAmount(a.openingBalance, true)) {
      return fail(`Account "${String(a.name)}" is invalid or uses an unsupported currency.`);
    }
  }
  for (const c of categories) {
    if (!isString(c.name) || (c.kind !== "income" && c.kind !== "expense")) return fail("A category is invalid.");
  }
  for (const t of transactions) {
    if (!isDate(t.date)) return fail("A transaction has an invalid date.");
    switch (t.type) {
      case "income":
      case "expense":
        if (!isAmount(t.amount) || !accountIds.has(t.accountId) || !categoryIds.has(t.categoryId)) {
          return fail("A transaction points to a missing account or category, or has an invalid amount.");
        }
        break;
      case "transfer":
        if (!isAmount(t.fromAmount) || !isAmount(t.toAmount) || !accountIds.has(t.fromAccountId) || !accountIds.has(t.toAccountId)) {
          return fail("A transfer points to a missing account or has an invalid amount.");
        }
        break;
      case "adjustment":
        if (!isAmount(t.delta, true) || !accountIds.has(t.accountId)) return fail("An adjustment is invalid.");
        break;
      default:
        return fail(`Unknown transaction type "${String(t.type)}".`);
    }
  }
  for (const b of budgets) {
    if (!isAmount(b.limit) || !Array.isArray(b.categoryIds)) return fail("A budget is invalid.");
  }
  for (const g of goals) {
    if (!isAmount(g.targetAmount) || !isString(g.currency) || !isCurrencyCode(g.currency)) return fail("A savings goal is invalid.");
  }
  for (const e of goalEntries) {
    if (!isAmount(e.amount) || !goalIds.has(e.goalId) || !accountIds.has(e.accountId) || !isDate(e.date)) {
      return fail("A savings goal entry is invalid.");
    }
  }

  for (const l of shoppingLists) {
    if (!isString(l.name) || !Number.isInteger(l.color)) return fail("A shopping list is invalid.");
  }
  for (const s of shoppingItems) {
    if (
      !isString(s.name) ||
      (s.priority !== "need" && s.priority !== "want") ||
      !isString(s.currency) ||
      !isCurrencyCode(s.currency) ||
      (s.estimate !== undefined && !isAmount(s.estimate)) ||
      (s.dueDate !== undefined && !isDate(s.dueDate)) ||
      (s.listId !== undefined && !shoppingListIds.has(s.listId))
    ) {
      return fail("A shopping list item is invalid.");
    }
  }

  // Older backups stored one `monthlyLimit`; normalizing converts it to the per-currency shape.
  const safeSettings: AppSettings = normalizeAppSettings(data.settings);

  return {
    ok: true,
    backup: {
      app: "moneytrack",
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: isString(json.exportedAt) ? json.exportedAt : "",
      encrypted: false,
      data: { ...(data as unknown as BackupData), settings: safeSettings },
    },
  };
}

/** Replace all data with the backup, atomically. The PIN (security setting) is kept. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const { data } = backup;
  const stores = ["accounts", "categories", "transactions", "budgets", "goals", "goalEntries", "shoppingItems", "shoppingLists"] as const;
  await withTransaction([...stores, "settings", "meta"], "readwrite", (tx) => {
    for (const store of stores) {
      const os = tx.objectStore(store);
      os.clear();
      for (const record of data[store]) os.put(record);
    }
    tx.objectStore("settings").put({ key: "app", value: data.settings, updatedAt: new Date().toISOString() });
    tx.objectStore("meta").put({ key: "seeded", value: true });
  });
}

/**
 * Delete every record in the current database, atomically, keeping the PIN (security setting).
 * Default categories and the Cash account are re-created on the next app start.
 */
export async function eraseAllData(): Promise<void> {
  const stores = ["accounts", "categories", "transactions", "budgets", "goals", "goalEntries", "shoppingItems", "shoppingLists", "meta"] as const;
  await withTransaction([...stores, "settings"], "readwrite", (tx) => {
    for (const store of stores) tx.objectStore(store).clear();
    tx.objectStore("settings").delete("app");
  });
}
