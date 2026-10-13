/**
 * Cloud backup flows: turn on (new recovery key), turn off, and recover with a recovery key.
 * Nothing here runs until the user explicitly agrees in the UI.
 */
import { type BackupFile, validateBackup } from "@/lib/backup/backup";
import { newId } from "@/lib/id";
import {
  type CloudCredentials,
  createDataKey,
  deriveFromRecoveryKey,
  openSnapshot,
  parseRecoveryKey,
  unwrapDataKey,
} from "@/lib/sync/crypto";
import { RemoteError } from "@/lib/sync/engine";
import { clearDeviceKeys, getDeviceKeys, setDeviceKeys, updateSyncState } from "@/lib/sync/local-idb";
import { cloudConfig, type SnapshotInfo, SupabaseBackupClient } from "@/lib/sync/supabase";

function requireConfig() {
  const config = cloudConfig();
  if (!config) throw new Error("Cloud backup isn't set up for this app yet.");
  return config;
}

async function unlock(recoveryKey: string) {
  const parsed = await parseRecoveryKey(recoveryKey);
  if (!parsed.ok) throw new Error(parsed.error);
  const config = requireConfig();
  const { credentials, kek } = await deriveFromRecoveryKey(parsed.bytes, config.emailDomain);
  return { client: new SupabaseBackupClient(config, credentials), credentials, kek };
}

/** Start backing up this device under the account and data key behind `credentials`. */
async function startDevice(client: SupabaseBackupClient, dek: CryptoKey, credentials: CloudCredentials, userId: string) {
  const deviceId = newId();
  await client.registerDevice(deviceId);
  await setDeviceKeys({ dek, credentials, userId });
  // A fresh chain: everything on this device counts as not backed up yet.
  await updateSyncState((s) => ({
    ...s,
    enabled: true,
    deviceId,
    userId,
    confirmedRevision: 0,
    inflight: undefined,
    lastConfirmedAt: undefined,
    failures: 0,
    lastError: undefined,
    blocked: undefined,
  }));
}

/** Turn cloud backup on with a newly generated recovery key (already shown to and confirmed by the user). */
export async function enableCloudBackup(recoveryKey: string): Promise<void> {
  const { client, credentials, kek } = await unlock(recoveryKey);
  const userId = await client.signUp();
  const existing = await client.getWrappedKey();
  let dek: CryptoKey;
  if (existing) {
    dek = await unwrapDataKey(kek, existing).catch(() => {
      throw new Error("This recovery key doesn't match the cloud backup it signs in to.");
    });
  } else {
    const created = await createDataKey(kek);
    await client.putWrappedKey(created.wrapped);
    dek = created.dek;
  }
  await startDevice(client, dek, credentials, userId);
}

/** Stop backing up. With `deleteCloud`, every cloud copy is deleted first (fails → nothing changes locally). */
export async function disableCloudBackup(deleteCloud: boolean): Promise<void> {
  if (deleteCloud) {
    const keys = await getDeviceKeys();
    const config = cloudConfig();
    if (!keys || !config) throw new Error("This device can't reach its cloud backup to delete it.");
    await new SupabaseBackupClient(config, keys.credentials).deleteAll();
  }
  await clearDeviceKeys();
  await updateSyncState((s) => ({ ...s, enabled: false, deviceId: undefined, userId: undefined, inflight: undefined, failures: 0, lastError: undefined, blocked: undefined }));
}

export interface CloudVault {
  client: SupabaseBackupClient;
  credentials: CloudCredentials;
  userId: string;
  dek: CryptoKey;
  snapshots: SnapshotInfo[];
}

/** Sign in with a recovery key and list its backups (newest first). */
export async function openCloudVault(recoveryKey: string): Promise<CloudVault> {
  const { client, credentials, kek } = await unlock(recoveryKey);
  let userId: string;
  try {
    userId = await client.signIn();
  } catch (e) {
    if (e instanceof RemoteError && e.kind === "auth") throw new Error("No cloud backup matches this recovery key.");
    throw e;
  }
  const wrapped = await client.getWrappedKey();
  if (!wrapped) throw new Error("No cloud backup matches this recovery key.");
  const dek = await unwrapDataKey(kek, wrapped).catch(() => {
    throw new Error("This recovery key can't unlock the cloud backup.");
  });
  return { client, credentials, userId, dek, snapshots: await client.listSnapshots() };
}

/** Download, verify, decrypt, and validate one snapshot. Nothing is written. */
export async function downloadCloudBackup(vault: CloudVault, snapshot: SnapshotInfo): Promise<BackupFile> {
  const payload = await vault.client.getSnapshot(snapshot.id);
  const json = await openSnapshot(vault.dek, payload, {
    format: payload.format,
    userId: vault.userId,
    deviceId: payload.deviceId,
    snapshotId: payload.id,
    revision: payload.revision,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The cloud backup is damaged.");
  }
  const result = validateBackup(parsed);
  if (!result.ok) throw new Error(result.error);
  return result.backup;
}

/** After a restore: keep backing up this device into the same cloud backup (as a new device chain). */
export async function continueWithVault(vault: CloudVault): Promise<void> {
  await startDevice(vault.client, vault.dek, vault.credentials, vault.userId);
}
