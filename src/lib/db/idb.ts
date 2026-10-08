/**
 * Native IndexedDB access. Only this module opens the database; features use repositories.
 * See .claude/skills/local-data/SKILL.md before changing the schema.
 */

import { DB_NAMES, getDataMode } from "./mode";

export const DB_VERSION = 1;

export const STORES = [
  "accounts",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "goalEntries",
  "settings",
  "meta",
] as const;

export type StoreName = (typeof STORES)[number];

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
  const tx = db.transaction(stores, mode);
  const done = transactionDone(tx);
  try {
    work(tx);
  } catch (error) {
    tx.abort();
    throw error;
  }
  await done;
}
