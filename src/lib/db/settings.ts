import { DEFAULT_CURRENCY, type CurrencyCode, isCurrencyCode } from "@/lib/money/currency";
import type { Minor } from "@/lib/money/money";
import { openDb, promisify, withTransaction } from "./idb";

/** Settings are key/value rows in the `settings` store (not BaseRecords). */
export interface SettingsMap {
  app: AppSettings;
  security: SecuritySettings;
}

export interface AppSettings {
  /** Default currency for new accounts and goals. */
  currency: CurrencyCode;
  /** Overall monthly spending limit per currency; a missing entry = not set. */
  monthlyLimits: Partial<Record<CurrencyCode, Minor>>;
}

export interface SecuritySettings {
  pinHash: string;
  salt: string;
  iterations: number;
  /** Lock again after the app has been in the background this long. */
  autoLockSeconds: number;
  /**
   * Digit count, so the lock screen can unlock as soon as the last digit is typed (like a phone lock screen).
   * Missing for PINs set before this existed; it's saved on the next successful unlock.
   */
  pinLength?: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  currency: DEFAULT_CURRENCY,
  monthlyLimits: {},
};

/**
 * Accepts any stored/imported shape and returns valid settings. Older versions stored a single
 * `monthlyLimit` (in the app currency); it becomes that currency's entry in `monthlyLimits`.
 */
export function normalizeAppSettings(raw: unknown): AppSettings {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const currency = typeof value.currency === "string" && isCurrencyCode(value.currency) ? value.currency : DEFAULT_CURRENCY;
  const isLimit = (v: unknown): v is Minor => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

  const monthlyLimits: Partial<Record<CurrencyCode, Minor>> = {};
  if (typeof value.monthlyLimits === "object" && value.monthlyLimits !== null) {
    for (const [code, limit] of Object.entries(value.monthlyLimits)) {
      if (isCurrencyCode(code) && isLimit(limit)) monthlyLimits[code] = limit;
    }
  } else if (isLimit(value.monthlyLimit)) {
    monthlyLimits[currency] = value.monthlyLimit;
  }
  return { currency, monthlyLimits };
}

export function monthlyLimitFor(settings: AppSettings, currency: CurrencyCode): Minor | null {
  return settings.monthlyLimits[currency] ?? null;
}

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
