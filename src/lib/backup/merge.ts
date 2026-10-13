/**
 * Merge a backup into this device's data. Pure: no IndexedDB, no clock. See .claude/skills/local-data/SKILL.md §4.
 *
 * Records are matched by `id`. A record on only one side is kept. When both sides have it, the one with the
 * later `updatedAt` wins (a tie keeps this device's copy). Soft deletes (`deletedAt`) are ordinary updates, so a
 * newer delete wins over an older edit and vice versa. This device's settings are kept.
 */
import type { BackupData } from "./backup";

export const MERGED_STORES = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "goalEntries",
  "shoppingItems",
  "shoppingLists",
] as const;

export interface MergeStats {
  /** Records only in the backup, now added. */
  added: number;
  /** Records on both sides where the backup's copy was newer and replaced this device's. */
  updated: number;
}

interface Versioned {
  id: string;
  updatedAt: string;
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
};

function mergeRecords<T extends Versioned>(local: T[], incoming: T[], stats: MergeStats): T[] {
  const byId = new Map(local.map((r) => [r.id, r]));
  for (const record of incoming) {
    const mine = byId.get(record.id);
    if (!mine) {
      byId.set(record.id, record);
      stats.added++;
    } else if (time(record.updatedAt) > time(mine.updatedAt)) {
      byId.set(record.id, record);
      stats.updated++;
    }
  }
  return [...byId.values()];
}

export function mergeBackupData(local: BackupData, incoming: BackupData): { data: BackupData; stats: MergeStats } {
  const stats: MergeStats = { added: 0, updated: 0 };
  const data: BackupData = {
    accounts: mergeRecords(local.accounts, incoming.accounts, stats),
    categories: mergeRecords(local.categories, incoming.categories, stats),
    transactions: mergeRecords(local.transactions, incoming.transactions, stats),
    budgets: mergeRecords(local.budgets, incoming.budgets, stats),
    goals: mergeRecords(local.goals, incoming.goals, stats),
    goalEntries: mergeRecords(local.goalEntries, incoming.goalEntries, stats),
    shoppingItems: mergeRecords(local.shoppingItems, incoming.shoppingItems, stats),
    shoppingLists: mergeRecords(local.shoppingLists, incoming.shoppingLists, stats),
    settings: local.settings,
  };
  return { data, stats };
}
