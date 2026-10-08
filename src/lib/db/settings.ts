import { DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/money/currency";
import type { Minor } from "@/lib/money/money";
import { openDb, promisify, withTransaction } from "./idb";

/** Settings are key/value rows in the `settings` store (not BaseRecords). */
export interface SettingsMap {
  app: AppSettings;
  security: SecuritySettings;
}

export interface AppSettings {
  currency: CurrencyCode;
  /** Overall monthly spending limit; null = not set. */
  monthlyLimit: Minor | null;
}

export interface SecuritySettings {
  pinHash: string;
  salt: string;
  iterations: number;
  /** Lock again after the app has been in the background this long. */
  autoLockSeconds: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  currency: DEFAULT_CURRENCY,
  monthlyLimit: null,
};

interface SettingRow<K extends keyof SettingsMap> {
  key: K;
  value: SettingsMap[K];
  updatedAt: string;
}

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K] | undefined> {
  const db = await openDb();
  const row = await promisify(
    db.transaction("settings").objectStore("settings").get(key) as IDBRequest<SettingRow<K> | undefined>,
  );
  return row?.value;
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): Promise<void> {
  const row: SettingRow<K> = { key, value, updatedAt: new Date().toISOString() };
  await withTransaction(["settings"], "readwrite", (tx) => tx.objectStore("settings").put(row));
}

export async function deleteSetting(key: keyof SettingsMap): Promise<void> {
  await withTransaction(["settings"], "readwrite", (tx) => tx.objectStore("settings").delete(key));
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const row = await promisify(
    db.transaction("meta").objectStore("meta").get(key) as IDBRequest<{ key: string; value: T } | undefined>,
  );
  return row?.value;
}
