/**
 * IndexedDB side of cloud backup: the sync state row, the device's backup keys, and consistent snapshots.
 * Client-only. Writes to `syncState`/`syncKeys` never count as data changes (they're not backed-up stores).
 */
import { BACKUP_SCHEMA_VERSION, type BackupFile } from "@/lib/backup/backup";
import { BACKED_UP_STORES, openDb, promisify, SYNC_STATE_KEY, withTransaction } from "@/lib/db/idb";
import { normalizeAppSettings } from "@/lib/db/settings";
import type { CloudCredentials } from "./crypto";
import { normalizeSyncState, type SyncLocal, type SyncState } from "./engine";

export interface DeviceKeys {
  /** Non-extractable AES-GCM data key. */
  dek: CryptoKey;
  credentials: CloudCredentials;
  userId: string;
}

const KEYS_ROW = "device";

export async function readSyncState(): Promise<SyncState> {
  const db = await openDb();
  return normalizeSyncState(await promisify(db.transaction("syncState").objectStore("syncState").get(SYNC_STATE_KEY)));
}

/** Atomic read-modify-write. `localRevision` always comes from storage, never from `change`. */
export async function updateSyncState(change: (state: SyncState) => SyncState): Promise<SyncState> {
  let next: SyncState | undefined;
  await withTransaction(["syncState"], "readwrite", (tx) => {
    const store = tx.objectStore("syncState");
    const request = store.get(SYNC_STATE_KEY);
    request.onsuccess = () => {
      const current = normalizeSyncState(request.result);
      next = { ...change(current), localRevision: current.localRevision };
      store.put({ ...next, key: SYNC_STATE_KEY });
    };
  });
  return next!;
}

const DATA_STORES = BACKED_UP_STORES.filter((s) => s !== "settings");

/** Every backed-up store plus the revision, in one read-only transaction (so they always match). */
export async function readSnapshot(): Promise<{ backup: BackupFile; revision: number }> {
  const db = await openDb();
  const tx = db.transaction([...BACKED_UP_STORES, "syncState"], "readonly");
  // Queue every request before awaiting: an idle IndexedDB transaction auto-commits.
  const listRequests = DATA_STORES.map((s) => promisify(tx.objectStore(s).getAll()));
  const settingsRequest = promisify(tx.objectStore("settings").get("app"));
  const stateRequest = promisify(tx.objectStore("syncState").get(SYNC_STATE_KEY));
  const lists = await Promise.all(listRequests);
  const settings = (await settingsRequest) as { value?: unknown } | undefined;
  const state = normalizeSyncState(await stateRequest);
  const data = Object.fromEntries(DATA_STORES.map((s, i) => [s, lists[i]]));
  return {
    backup: {
      app: "moneytrack",
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      encrypted: false,
      data: { ...(data as unknown as BackupFile["data"]), settings: normalizeAppSettings(settings?.value) },
    },
    revision: state.localRevision,
  };
}

export const idbSyncLocal: SyncLocal = { read: readSyncState, update: updateSyncState, snapshot: readSnapshot };

export async function getDeviceKeys(): Promise<DeviceKeys | null> {
  const db = await openDb();
  const row = (await promisify(db.transaction("syncKeys").objectStore("syncKeys").get(KEYS_ROW))) as
    | (DeviceKeys & { key: string })
    | undefined;
  return row?.dek && row.credentials && row.userId ? { dek: row.dek, credentials: row.credentials, userId: row.userId } : null;
}

export async function setDeviceKeys(keys: DeviceKeys): Promise<void> {
  await withTransaction(["syncKeys"], "readwrite", (tx) => tx.objectStore("syncKeys").put({ key: KEYS_ROW, ...keys }));
}

export async function clearDeviceKeys(): Promise<void> {
  await withTransaction(["syncKeys"], "readwrite", (tx) => tx.objectStore("syncKeys").delete(KEYS_ROW));
}
