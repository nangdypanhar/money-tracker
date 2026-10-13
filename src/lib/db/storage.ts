/**
 * Keeping this device's data safe from the browser: persistent storage and the last-backup date.
 * Client-only (guarded for SSR).
 */
import { getMeta, setMeta } from "./settings";

export type StoragePersistence = "persisted" | "best-effort" | "unsupported";

/**
 * Ask the browser not to clear this site's storage on its own (e.g. when the phone is low on space).
 * Installed apps are usually granted it silently. It doesn't survive the user clearing site data or
 * uninstalling, so backups still matter.
 */
export async function requestPersistentStorage(): Promise<StoragePersistence> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return "unsupported";
  try {
    if (await navigator.storage.persisted()) return "persisted";
    return (await navigator.storage.persist()) ? "persisted" : "best-effort";
  } catch {
    return "best-effort";
  }
}

export async function getStoragePersistence(): Promise<StoragePersistence> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) return "unsupported";
  try {
    return (await navigator.storage.persisted()) ? "persisted" : "best-effort";
  } catch {
    return "best-effort";
  }
}

/** Device-local (in `meta`, not in backups): when this device last exported or shared a backup. */
export function getLastBackupAt(): Promise<string | undefined> {
  return getMeta<string>("lastBackupAt");
}

export async function setLastBackupAt(iso: string): Promise<void> {
  await setMeta("lastBackupAt", iso);
}
