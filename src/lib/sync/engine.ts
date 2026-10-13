/**
 * Cloud backup engine: decides what to upload and when local data counts as backed up. Pure — storage,
 * server, and keys come in as ports, so scripts/finance-check.ts tests it with in-memory fakes.
 * See .claude/skills/local-data/SKILL.md §6.
 *
 * Change tracking: every local write bumps `localRevision` in the same IndexedDB transaction (lib/db/idb.ts).
 * Pending changes exist while localRevision > confirmedRevision. `confirmedRevision` only moves after the
 * server confirms it stored a snapshot that includes those changes — never because a request was sent.
 *
 * Each upload is a full encrypted snapshot (validated BackupFile) tagged with the revision it was read at.
 * Retries reuse the snapshot id (idempotent); the server rejects revisions that aren't newer (stale).
 */
import { validateBackup } from "@/lib/backup/backup";
import { SNAPSHOT_FORMAT, type SealedSnapshot, type SnapshotContext, sealSnapshot } from "./crypto";

export type SyncBlock = "keys-missing" | "conflict" | "signed-out";

export interface SyncState {
  localRevision: number;
  confirmedRevision: number;
  /** The user turned cloud backup on (nothing is uploaded otherwise). */
  enabled: boolean;
  deviceId?: string;
  userId?: string;
  /** Snapshot being uploaded; reused on retry so a repeated request can't create a second copy. */
  inflight?: { snapshotId: string; revision: number };
  /** Server time of the last confirmed snapshot. */
  lastConfirmedAt?: string;
  failures: number;
  lastError?: string;
  /** Backing up can't continue without the user. */
  blocked?: SyncBlock;
}

export function normalizeSyncState(raw: unknown): SyncState {
  const v = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<SyncState>;
  const int = (n: unknown) => (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0);
  return {
    localRevision: int(v.localRevision),
    confirmedRevision: int(v.confirmedRevision),
    enabled: v.enabled === true,
    deviceId: typeof v.deviceId === "string" ? v.deviceId : undefined,
    userId: typeof v.userId === "string" ? v.userId : undefined,
    inflight: v.inflight && typeof v.inflight.snapshotId === "string" ? { snapshotId: v.inflight.snapshotId, revision: int(v.inflight.revision) } : undefined,
    lastConfirmedAt: typeof v.lastConfirmedAt === "string" ? v.lastConfirmedAt : undefined,
    failures: int(v.failures),
    lastError: typeof v.lastError === "string" ? v.lastError : undefined,
    blocked: v.blocked === "keys-missing" || v.blocked === "conflict" || v.blocked === "signed-out" ? v.blocked : undefined,
  };
}

export const hasPendingChanges = (s: SyncState) => s.localRevision > s.confirmedRevision;

export interface SyncLocal {
  read(): Promise<SyncState>;
  /** Atomic read-modify-write of the sync state. Must not count as a data change. */
  update(change: (state: SyncState) => SyncState): Promise<SyncState>;
  /** All backed-up data and the revision it was at, read in one consistent transaction. */
  snapshot(): Promise<{ backup: unknown; revision: number }>;
}

export interface CommitInput {
  deviceId: string;
  snapshotId: string;
  revision: number;
  format: number;
  iv: string;
  ciphertext: string;
  sha256: string;
}

export type CommitResult =
  | { status: "ok" | "duplicate"; revision: number; createdAt: string; headRevision: number }
  | { status: "stale"; headRevision: number };

export type RemoteErrorKind = "network" | "server" | "auth" | "rejected";

export class RemoteError extends Error {
  readonly kind: RemoteErrorKind;
  constructor(message: string, kind: RemoteErrorKind) {
    super(message);
    this.name = "RemoteError";
    this.kind = kind;
  }
}

export interface SyncRemote {
  commit(input: CommitInput, options?: { keepalive?: boolean }): Promise<CommitResult>;
}

export interface SyncKeys {
  dek: CryptoKey;
  userId: string;
}

export type SyncOutcome =
  | { kind: "disabled" }
  | { kind: "up-to-date" }
  | { kind: "uploaded"; revision: number }
  | { kind: "failed"; error: string }
  | { kind: "blocked"; reason: SyncBlock };

export interface SyncDeps {
  local: SyncLocal;
  remote: SyncRemote;
  /** Null when this device has no backup keys (e.g. after site data was cleared). */
  keys: SyncKeys | null;
  newId: () => string;
  seal?: (dek: CryptoKey, plaintext: string, context: SnapshotContext) => Promise<SealedSnapshot>;
  /** Best-effort upload while the page is being hidden/closed. */
  keepalive?: boolean;
}

const MAX_ROUNDS = 3;

/** Upload pending changes, if any. Safe to call any time, repeatedly, or concurrently (the server serializes). */
export async function backUpOnce(deps: SyncDeps): Promise<SyncOutcome> {
  const { local, remote, keys, newId, seal = sealSnapshot } = deps;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const state = await local.read();
    if (!state.enabled) return { kind: "disabled" };
    if (state.blocked === "conflict") return { kind: "blocked", reason: "conflict" };
    if (!keys || !state.deviceId) {
      await local.update((s) => ({ ...s, blocked: "keys-missing" }));
      return { kind: "blocked", reason: "keys-missing" };
    }
    if (!hasPendingChanges(state)) return { kind: "up-to-date" };

    const { backup, revision } = await local.snapshot();
    const checked = validateBackup(backup);
    if (!checked.ok) {
      // Never upload data that wouldn't restore; keep it pending so nothing is marked backed up.
      await local.update((s) => ({ ...s, lastError: `Local data failed validation: ${checked.error}`, failures: s.failures + 1 }));
      return { kind: "failed", error: checked.error };
    }

    const snapshotId = state.inflight?.revision === revision ? state.inflight.snapshotId : newId();
    await local.update((s) => ({ ...s, inflight: { snapshotId, revision } }));

    let result: CommitResult;
    try {
      const context: SnapshotContext = { format: SNAPSHOT_FORMAT, userId: keys.userId, deviceId: state.deviceId, snapshotId, revision };
      const sealed = await seal(keys.dek, JSON.stringify(checked.backup), context);
      result = await remote.commit(
        { deviceId: state.deviceId, snapshotId, revision, format: SNAPSHOT_FORMAT, ...sealed },
        { keepalive: deps.keepalive },
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (e instanceof RemoteError && e.kind === "auth") {
        await local.update((s) => ({ ...s, blocked: "signed-out", lastError: error }));
        return { kind: "blocked", reason: "signed-out" };
      }
      await local.update((s) => ({ ...s, lastError: error, failures: s.failures + 1 }));
      return { kind: "failed", error };
    }

    if (result.status === "stale") {
      const latest = await local.read();
      if (result.headRevision > latest.localRevision) {
        // The server has a newer revision for this device than this device ever made: this data isn't what
        // that backup chain describes. Stop instead of uploading over it.
        await local.update((s) => ({ ...s, blocked: "conflict", inflight: undefined }));
        return { kind: "blocked", reason: "conflict" };
      }
      // Another upload (e.g. another tab) already stored a revision at least this new from this same data.
      await local.update((s) => ({
        ...s,
        confirmedRevision: Math.max(s.confirmedRevision, result.headRevision),
        inflight: s.inflight?.snapshotId === snapshotId ? undefined : s.inflight,
      }));
      continue;
    }

    const after = await local.update((s) => ({
      ...s,
      confirmedRevision: Math.max(s.confirmedRevision, result.revision),
      lastConfirmedAt: result.createdAt,
      inflight: s.inflight?.snapshotId === snapshotId ? undefined : s.inflight,
      failures: 0,
      lastError: undefined,
      blocked: undefined,
    }));
    if (!hasPendingChanges(after)) return { kind: "uploaded", revision: result.revision };
    // More edits arrived during the upload: go around again.
  }
  return hasPendingChanges(await local.read()) ? { kind: "failed", error: "Changes kept arriving; will retry." } : { kind: "up-to-date" };
}

/** Delay before the next automatic retry: 15 s doubling to 15 min, with ±20% jitter. */
export function retryDelayMs(failures: number, random: () => number = Math.random): number {
  const base = Math.min(15 * 60_000, 15_000 * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

export type SyncStatus = "local-only" | "backed-up" | "waiting" | "backing-up" | "failed" | "recovery-required";

export function syncStatus(state: SyncState, running: boolean): SyncStatus {
  if (!state.enabled) return "local-only";
  if (state.blocked) return "recovery-required";
  if (running) return "backing-up";
  if (!hasPendingChanges(state)) return "backed-up";
  return state.failures > 0 ? "failed" : "waiting";
}
