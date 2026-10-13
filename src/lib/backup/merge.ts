/**
 * Merge a backup into this device's data, and preview what a merge or a replace would change.
 * Pure: no IndexedDB, no clock. See .claude/skills/local-data/SKILL.md §4.
 *
 * Records are matched by `id`. A record on only one side is kept. When both sides have it, the one with the
 * later `updatedAt` wins (a tie keeps this device's copy). Soft deletes (`deletedAt`) are ordinary updates, so a
 * newer delete wins over an older edit and vice versa. This device's settings are kept.
 *
 * Only *visible* changes count: a newer copy with the same content (only timestamps differ) is not a change, and
 * a deleted record arriving that was never on this device is merged silently (it keeps the delete in sync) but
 * isn't "added".
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

export type MergedStore = (typeof MERGED_STORES)[number];

interface Versioned {
  id: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface StoreChanges<T = Versioned> {
  /** New on this device (or a record deleted here that comes back). */
  added: T[];
  /** On both, visibly different; `after` is what this device will have. */
  updated: { before: T; after: T }[];
  /** Live on this device, removed by the import. */
  removed: T[];
}

export type DataChanges = { [S in MergedStore]: StoreChanges<BackupData[S][number]> };

export interface ChangeCounts {
  added: number;
  updated: number;
  removed: number;
}

/** Kept for callers that only need totals (toasts). */
export type MergeStats = ChangeCounts;

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
};

const live = (r: Versioned | undefined) => !!r && !r.deletedAt;

/** Content equality, ignoring bookkeeping timestamps. Key order doesn't matter; `undefined` fields are absent. */
export function sameContent(a: object, b: object): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.keys(value)
        .filter((k) => k !== "createdAt" && k !== "updatedAt" && k !== "deletedAt" && (value as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]);
    }
    return value;
  };
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

const emptyChanges = (): StoreChanges<never> => ({ added: [], updated: [], removed: [] });

/** What `incoming` wins over `mine` in a merge, and how that looks to the user. */
function classify<T extends Versioned>(mine: T | undefined, incoming: T, changes: StoreChanges<T>): boolean {
  if (!mine) {
    if (live(incoming)) changes.added.push(incoming);
    return true; // tombstones are merged too, just not shown
  }
  if (time(incoming.updatedAt) <= time(mine.updatedAt)) return false;
  if (live(mine) && !live(incoming)) changes.removed.push(mine);
  else if (!live(mine) && live(incoming)) changes.added.push(incoming);
  else if (live(mine) && live(incoming)) {
    if (sameContent(mine, incoming)) return false; // only timestamps differ: keep this device's copy
    changes.updated.push({ before: mine, after: incoming });
  } else return false; // deleted on both: nothing to do
  return true;
}

function mergeStore<T extends Versioned>(local: T[], incoming: T[]): { records: T[]; changes: StoreChanges<T> } {
  const byId = new Map(local.map((r) => [r.id, r]));
  const changes: StoreChanges<T> = emptyChanges();
  for (const record of incoming) {
    if (classify(byId.get(record.id), record, changes)) byId.set(record.id, record);
  }
  return { records: [...byId.values()], changes };
}

export function countChanges(changes: DataChanges): ChangeCounts {
  const counts = { added: 0, updated: 0, removed: 0 };
  for (const store of MERGED_STORES) {
    counts.added += changes[store].added.length;
    counts.updated += changes[store].updated.length;
    counts.removed += changes[store].removed.length;
  }
  return counts;
}

export function mergeBackupData(
  local: BackupData,
  incoming: BackupData,
): { data: BackupData; stats: ChangeCounts; changes: DataChanges } {
  const data = { settings: local.settings } as BackupData;
  const changes = {} as Record<MergedStore, StoreChanges>;
  for (const store of MERGED_STORES) {
    const result = mergeStore<Versioned>(local[store], incoming[store]);
    (data as unknown as Record<MergedStore, Versioned[]>)[store] = result.records;
    changes[store] = result.changes;
  }
  const typed = changes as unknown as DataChanges;
  return { data, stats: countChanges(typed), changes: typed };
}

/** What replacing this device's data with `incoming` would change (live records only). */
export function replaceChanges(local: BackupData, incoming: BackupData): DataChanges {
  const changes = {} as Record<MergedStore, StoreChanges>;
  for (const store of MERGED_STORES) {
    const mine = new Map((local[store] as Versioned[]).filter(live).map((r) => [r.id, r]));
    const theirs = new Map((incoming[store] as Versioned[]).filter(live).map((r) => [r.id, r]));
    const c: StoreChanges = emptyChanges();
    for (const [id, record] of theirs) {
      const before = mine.get(id);
      if (!before) c.added.push(record);
      else if (!sameContent(before, record)) c.updated.push({ before, after: record });
    }
    for (const [id, record] of mine) if (!theirs.has(id)) c.removed.push(record);
    changes[store] = c;
  }
  return changes as unknown as DataChanges;
}
