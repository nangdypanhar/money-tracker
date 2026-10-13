/**
 * Native IndexedDB access. Only this module opens the database; features use repositories.
 * See .claude/skills/local-data/SKILL.md before changing the schema.
 */

import { DB_NAMES, getDataMode } from "./mode";

export const DB_VERSION = 4;

export const STORES = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "goalEntries",
  "shoppingItems",
  "shoppingLists",
  "settings",
  "meta",
  "syncState",
  "syncKeys",
] as const;

export type StoreName = (typeof STORES)[number];

/**
 * Stores whose contents are in a backup. Every write to one of them bumps `localRevision` in `syncState`
 * inside the same transaction, so a saved change can never exist without being marked "not backed up yet".
 */
export const BACKED_UP_STORES: readonly StoreName[] = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "goalEntries",
  "shoppingItems",
  "shoppingLists",
  "settings",
];

/** The single row in `syncState`. Revisions only ever go up; see .claude/skills/local-data/SKILL.md §6. */
export const SYNC_STATE_KEY = "state";

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

/** migrations[n] upgrades from version n to n+1. Never edit a released step; append a new one. */
const migrations: Migration[] = [
  // v0 → v1: initial schema
  (db) => {
    db.createObjectStore("accounts", { keyPath: "id" });
    db.createObjectStore("categories", { keyPath: "id" });

    const transactions = db.createObjectStore("transactions", { keyPath: "id" });
    transactions.createIndex("date", "date");
    transactions.createIndex("accountId", "accountId");
    transactions.createIndex("categoryId", "categoryId");

    db.createObjectStore("budgets", { keyPath: "id" });
    db.createObjectStore("goals", { keyPath: "id" });

    const goalEntries = db.createObjectStore("goalEntries", { keyPath: "id" });
    goalEntries.createIndex("goalId", "goalId");

    db.createObjectStore("settings", { keyPath: "key" });
    db.createObjectStore("meta", { keyPath: "key" });
  },
  // v1 → v2: shopping list (new empty store; existing data untouched)
  (db) => {
    db.createObjectStore("shoppingItems", { keyPath: "id" });
  },
  // v2 → v3: named shopping lists (new empty store; items without a list stay as they are)
  (db) => {
    db.createObjectStore("shoppingLists", { keyPath: "id" });
  },
  // v3 → v4: cloud backup bookkeeping (local revision counter, sync status) and the device's backup keys.
  // New empty stores; existing data untouched.
  (db) => {
    db.createObjectStore("syncState", { keyPath: "key" });
    db.createObjectStore("syncKeys", { keyPath: "key" });
  },
];

let dbPromise: Promise<IDBDatabase> | null = null;

/** Database for the current mode (real or demo); read once per page load. */
export function currentDbName(): string {
  return DB_NAMES[getDataMode()];
}

export function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available (server render or unsupported browser)."));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(currentDbName(), DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction!;
      for (let v = event.oldVersion; v < DB_VERSION; v++) migrations[v](db, tx);
    };

    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgraded the schema: close so it can proceed, then reload this tab.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        if (typeof window !== "undefined") window.location.reload();
      };
      resolve(db);
    };

    request.onblocked = () =>
      reject(new Error("MoneyTrack is open in another tab with an older version. Close it and reload."));

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

/** Close and delete a database (used to reset demo data). Resolves once it's gone. */
export async function deleteDb(name: string): Promise<void> {
  if (dbPromise && name === currentDbName()) {
    const db = await dbPromise;
    db.onversionchange = null;
    db.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close MoneyTrack in other tabs and try again."));
  });
}

export function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

/**
 * Run several writes atomically. `work` must queue its requests synchronously
 * (no awaiting other promises inside), or the transaction auto-commits early.
 */
export async function withTransaction(
  stores: StoreName[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => void,
): Promise<void> {
  const db = await openDb();
  const tracked = mode === "readwrite" && stores.some((s) => BACKED_UP_STORES.includes(s));
  const scope = tracked && !stores.includes("syncState") ? [...stores, "syncState" as const] : stores;
  const tx = db.transaction(scope, mode);
  const done = transactionDone(tx);
  try {
    work(tx);
    if (tracked) bumpLocalRevision(tx);
  } catch (error) {
    tx.abort();
    throw error;
  }
  await done;
  if (tracked) notifyLocalChange();
}

/** Increment the local revision inside `tx` (commits or aborts together with the data it marks). */
function bumpLocalRevision(tx: IDBTransaction): void {
  const store = tx.objectStore("syncState");
  const request = store.get(SYNC_STATE_KEY);
  request.onsuccess = () => {
    const state = (request.result ?? { key: SYNC_STATE_KEY }) as { localRevision?: number };
    store.put({ ...state, key: SYNC_STATE_KEY, localRevision: (state.localRevision ?? 0) + 1 });
  };
}

const changeListeners = new Set<() => void>();

/** Called after any backed-up data is committed (used to schedule a cloud backup). Returns an unsubscribe. */
export function onLocalChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function notifyLocalChange(): void {
  for (const listener of changeListeners) listener();
}
