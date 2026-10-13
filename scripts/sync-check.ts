/**
 * Cloud backup checks (engine + crypto) with in-memory fakes for IndexedDB and Supabase. No test framework:
 *   pnpm check:sync
 * The fake server mirrors supabase/migrations/0001_cloud_backup.sql `commit_backup` (dedupe by snapshot id,
 * reject revisions that aren't newer than the device's head). RLS itself is checked by supabase/tests/.
 */
import assert from "node:assert/strict";
import { validateBackup } from "@/lib/backup/backup";
import {
  createDataKey,
  deriveFromRecoveryKey,
  fromBase64,
  generateRecoveryKey,
  openSnapshot,
  parseRecoveryKey,
  SNAPSHOT_FORMAT,
  type SnapshotContext,
  toBase64,
  unwrapDataKey,
} from "@/lib/sync/crypto";
import {
  backUpOnce,
  type CommitInput,
  type CommitResult,
  hasPendingChanges,
  normalizeSyncState,
  RemoteError,
  retryDelayMs,
  type SyncDeps,
  type SyncLocal,
  type SyncRemote,
  type SyncState,
  syncStatus,
} from "@/lib/sync/engine";
import { formatSince } from "@/lib/sync/status";
import { parseCommitResult } from "@/lib/sync/supabase";

// ------------------------------------------------------------------------------------------------ fakes

const ts = "2026-10-13T00:00:00.000Z";
const base = (id: string) => ({ id, createdAt: ts, updatedAt: ts });
type Rec = Record<string, unknown> & { id: string };

/** IndexedDB stand-in: data + sync state; `write` bumps the revision atomically like withTransaction. */
class FakeLocal implements SyncLocal {
  data: { accounts: Rec[]; categories: Rec[]; transactions: Rec[] } = {
    accounts: [{ ...base("cash"), name: "Cash", kind: "cash", currency: "USD", openingBalance: 0, archived: false }],
    categories: [{ ...base("food"), name: "Food", kind: "expense", color: 0, icon: "x" }],
    transactions: [],
  };
  state: SyncState = normalizeSyncState({});
  /** Hook to run code in the middle of an upload (e.g. a user edit). */
  onSnapshot?: () => void;

  write(change: (d: FakeLocal["data"]) => void) {
    change(this.data);
    this.state = { ...this.state, localRevision: this.state.localRevision + 1 };
  }
  async read() {
    return structuredClone(this.state);
  }
  async update(change: (s: SyncState) => SyncState) {
    this.state = change(structuredClone(this.state));
    return structuredClone(this.state);
  }
  async snapshot() {
    const result = {
      backup: structuredClone({ app: "moneytrack", schemaVersion: 3, exportedAt: ts, encrypted: false, data: { ...this.data, budgets: [], goals: [], goalEntries: [], shoppingItems: [], shoppingLists: [], settings: {} } }),
      revision: this.state.localRevision,
    };
    this.onSnapshot?.();
    return result;
  }
  /** What survives a browser restart: everything in IndexedDB, nothing in memory. */
  async touch() {
    this.state = { ...this.state, localRevision: this.state.localRevision + 1 };
  }
  restart(): FakeLocal {
    const copy = new FakeLocal();
    copy.data = structuredClone(this.data);
    copy.state = normalizeSyncState(JSON.parse(JSON.stringify(this.state)));
    return copy;
  }
}

type Stored = CommitInput & { createdAt: string };

class FakeServer implements SyncRemote {
  heads = new Map<string, number>();
  snapshots = new Map<string, Stored>();
  calls = 0;
  /** Fail the next N commits before (network) or after (response lost) storing. */
  failBefore = 0;
  failAfter = 0;
  failStatus: "network" | "server" = "network";
  clock = 0;

  register(deviceId: string) {
    this.heads.set(deviceId, 0);
  }
  async commit(input: CommitInput): Promise<CommitResult> {
    this.calls++;
    await Promise.resolve(); // let concurrent callers interleave
    if (this.failBefore > 0) {
      this.failBefore--;
      throw new RemoteError(this.failStatus === "network" ? "Network down" : "Server error (500)", this.failStatus);
    }
    const head = this.heads.get(input.deviceId);
    if (head === undefined) throw new RemoteError("unknown device", "rejected");
    const existing = this.snapshots.get(input.snapshotId);
    let result: CommitResult;
    if (existing) {
      result = { status: "duplicate", revision: existing.revision, createdAt: existing.createdAt, headRevision: head };
    } else if (input.revision <= head) {
      result = { status: "stale", headRevision: head };
    } else {
      const createdAt = new Date(Date.UTC(2026, 9, 13, 0, 0, ++this.clock)).toISOString();
      this.snapshots.set(input.snapshotId, { ...input, createdAt });
      this.heads.set(input.deviceId, input.revision);
      result = { status: "ok", revision: input.revision, createdAt, headRevision: input.revision };
    }
    if (this.failAfter > 0) {
      this.failAfter--;
      throw new RemoteError("Connection lost", "network"); // stored, but the client never hears back
    }
    return result;
  }
  latest(deviceId: string): Stored {
    return [...this.snapshots.values()].filter((s) => s.deviceId === deviceId).sort((a, b) => b.revision - a.revision)[0];
  }
}

let ids = 0;
const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
const contextOf = (s: Stored, userId: string): SnapshotContext => ({ format: s.format, userId, deviceId: s.deviceId, snapshotId: s.snapshotId, revision: s.revision });

async function setup() {
  const recovery = await generateRecoveryKey();
  const parsed = await parseRecoveryKey(recovery);
  assert.ok(parsed.ok);
  const { credentials, kek } = await deriveFromRecoveryKey(parsed.bytes, "example.invalid");
  const { dek, wrapped } = await createDataKey(kek);
  const local = new FakeLocal();
  const server = new FakeServer();
  const deviceId = newId();
  server.register(deviceId);
  local.state = { ...local.state, enabled: true, deviceId, userId: "user-a" };
  const deps = (over: Partial<SyncDeps> = {}): SyncDeps => ({ local, remote: server, keys: { dek, userId: "user-a" }, newId, ...over });
  return { recovery, credentials, kek, dek, wrapped, local, server, deviceId, deps };
}

const expense = (id: string, amount: number, note = "Lunch with salary 4321") => ({
  ...base(id), type: "expense", date: "2026-10-12", accountId: "cash", categoryId: "food", amount, note,
});

async function decryptLatest(server: FakeServer, deviceId: string, dek: CryptoKey) {
  const s = server.latest(deviceId);
  const json = await openSnapshot(dek, s, contextOf(s, "user-a"));
  const checked = validateBackup(JSON.parse(json));
  assert.ok(checked.ok);
  return checked.backup;
}

// ------------------------------------------------------------------------------------------------ recovery key

{
  const key = await generateRecoveryKey();
  assert.match(key, /^([A-Z2-7]{4}-){8}[A-Z2-7]{4}$/);
  assert.notEqual(key, await generateRecoveryKey());
  // Lenient input: lowercase, spaces, no dashes.
  assert.ok((await parseRecoveryKey(key.toLowerCase().replace(/-/g, " "))).ok);
  // A one-character typo is caught by the checksum.
  const typo = (key[0] === "A" ? "B" : "A") + key.slice(1);
  const bad = await parseRecoveryKey(typo);
  assert.ok(!bad.ok && bad.error.includes("typo"));
  assert.equal((await parseRecoveryKey("not a key")).ok, false);
  // Same key → same login and same KEK (that's how recovery works on a wiped device); different key → different.
  const a = await parseRecoveryKey(key);
  assert.ok(a.ok);
  const d1 = await deriveFromRecoveryKey(a.bytes, "example.invalid");
  const d2 = await deriveFromRecoveryKey(a.bytes, "example.invalid");
  assert.deepEqual(d1.credentials, d2.credentials);
  assert.match(d1.credentials.email, /^mt-[0-9a-f]{32}@example\.invalid$/);
  const other = await parseRecoveryKey(await generateRecoveryKey());
  assert.ok(other.ok);
  assert.notEqual((await deriveFromRecoveryKey(other.bytes, "example.invalid")).credentials.email, d1.credentials.email);
  // The login password is not the KEK (independent HKDF outputs).
  const { wrapped } = await createDataKey(d1.kek);
  await unwrapDataKey(d2.kek, wrapped); // same recovery key unwraps
  await assert.rejects(unwrapDataKey((await deriveFromRecoveryKey(other.bytes, "example.invalid")).kek, wrapped)); // wrong key
}

// ------------------------------------------------------------------------------------------------ engine

// Cloud backup disabled: nothing is uploaded, ever.
{
  const { local, server, deps } = await setup();
  local.state.enabled = false;
  local.write((d) => d.transactions.push(expense("t1", 500)));
  assert.deepEqual(await backUpOnce(deps()), { kind: "disabled" });
  assert.equal(server.calls, 0);
  assert.equal(syncStatus(local.state, false), "local-only");
}

// Data that existed before cloud backup (revision 0) is still uploaded once when backup is turned on,
// and "Backed up" is never shown before the server confirms.
{
  const { local, server, deps, deviceId, dek } = await setup();
  local.data.transactions.push(expense("old", 900)); // written before revision tracking existed
  assert.equal(local.state.localRevision, 0);
  assert.equal(syncStatus(local.state, false), "waiting");
  assert.deepEqual(await backUpOnce(deps()), { kind: "uploaded", revision: 1 });
  assert.equal(server.snapshots.size, 1);
  assert.equal((await decryptLatest(server, deviceId, dek)).data.transactions.length, 1);
  assert.equal(syncStatus(local.state, false), "backed-up");
  assert.deepEqual(await backUpOnce(deps()), { kind: "up-to-date" }); // and only once
  assert.equal(server.snapshots.size, 1);
}

// Saving while offline: the local write stands, the change stays queued, then uploads when back online.
{
  const { local, server, deps, deviceId, dek } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 500)));
  assert.equal(syncStatus(local.state, false), "waiting");
  server.failBefore = 1;
  const offline = await backUpOnce(deps());
  assert.equal(offline.kind, "failed");
  assert.equal(local.data.transactions.length, 1);
  assert.ok(hasPendingChanges(local.state));
  assert.equal(local.state.confirmedRevision, 0);
  assert.equal(local.state.lastConfirmedAt, undefined); // never "backed up" before the server confirms
  assert.equal(syncStatus(local.state, false), "failed");
  assert.deepEqual(await backUpOnce(deps()), { kind: "uploaded", revision: 1 });
  assert.equal(local.state.confirmedRevision, 1);
  assert.equal(syncStatus(local.state, false), "backed-up");
  assert.ok(local.state.lastConfirmedAt);
  assert.equal(local.state.failures, 0);
  // Nothing pending → no request at all.
  const calls = server.calls;
  assert.deepEqual(await backUpOnce(deps()), { kind: "up-to-date" });
  assert.equal(server.calls, calls);
  // Successful encrypted backup: no readable financial data on the server, and it decrypts to the same data.
  const stored = server.latest(deviceId);
  const raw = atob(stored.ciphertext);
  for (const secret of ["Lunch", "4321", "Cash", "expense", "moneytrack"]) assert.equal(raw.includes(secret), false);
  const restored = await decryptLatest(server, deviceId, dek);
  assert.equal(restored.data.transactions.length, 1);
  assert.equal((restored.data.transactions[0] as { amount: number }).amount, 500);
}

// Server errors: queued, retried with growing back-off.
{
  const { local, server, deps } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 1)));
  server.failBefore = 2;
  server.failStatus = "server";
  assert.equal((await backUpOnce(deps())).kind, "failed");
  assert.equal((await backUpOnce(deps())).kind, "failed");
  assert.equal(local.state.failures, 2);
  assert.match(local.state.lastError ?? "", /500/);
  assert.equal((await backUpOnce(deps())).kind, "uploaded");
  assert.equal(retryDelayMs(1, () => 0.5), 15_000);
  assert.equal(retryDelayMs(3, () => 0.5), 60_000);
  assert.equal(retryDelayMs(50, () => 0.5), 15 * 60_000);
  assert.ok(retryDelayMs(2, () => 0) >= 24_000 && retryDelayMs(2, () => 1) <= 36_000);
}

// Interrupted upload (stored, but the response was lost) + retry: same snapshot id, no duplicate copy.
{
  const { local, server, deps } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 700)));
  server.failAfter = 1;
  assert.equal((await backUpOnce(deps())).kind, "failed");
  assert.equal(server.snapshots.size, 1); // the server did store it…
  assert.equal(local.state.confirmedRevision, 0); // …but the device doesn't count it until confirmed
  const inflight = local.state.inflight;
  assert.ok(inflight);
  assert.deepEqual(await backUpOnce(deps()), { kind: "uploaded", revision: 1 });
  assert.equal(server.snapshots.size, 1); // retry was a duplicate, not a second copy
  assert.equal(local.state.inflight, undefined);
}

// Duplicate requests: the same commit twice is stored once.
{
  const { server, deviceId } = await setup();
  const input = { deviceId, snapshotId: newId(), revision: 1, format: SNAPSHOT_FORMAT, iv: "", ciphertext: "", sha256: "" };
  assert.equal((await server.commit(input)).status, "ok");
  assert.equal((await server.commit(input)).status, "duplicate");
  assert.equal(server.snapshots.size, 1);
}

// Browser restart / app reopened mid-upload: pending changes and the in-flight id survive and are reused.
{
  const { local, server, deps, dek } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 1)));
  server.failAfter = 1;
  await backUpOnce(deps());
  const reopened = local.restart();
  assert.ok(hasPendingChanges(reopened.state));
  assert.equal(reopened.state.inflight?.snapshotId, local.state.inflight?.snapshotId);
  assert.equal((await backUpOnce({ ...deps(), local: reopened, keys: { dek, userId: "user-a" } })).kind, "uploaded");
  assert.equal(server.snapshots.size, 1);
}

// Updates and deletions are backed up (soft-delete tombstones included).
{
  const { local, server, deps, deviceId, dek } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 100), expense("t2", 200)));
  await backUpOnce(deps());
  local.write((d) => {
    d.transactions[0] = { ...d.transactions[0], amount: 150, updatedAt: "2026-10-13T01:00:00.000Z" };
    d.transactions[1] = { ...d.transactions[1], deletedAt: "2026-10-13T01:00:00.000Z", updatedAt: "2026-10-13T01:00:00.000Z" };
  });
  assert.ok(hasPendingChanges(local.state));
  assert.deepEqual(await backUpOnce(deps()), { kind: "uploaded", revision: 2 });
  const restored = await decryptLatest(server, deviceId, dek);
  const byId = new Map(restored.data.transactions.map((t) => [t.id, t]));
  assert.equal((byId.get("t1") as { amount: number }).amount, 150);
  assert.ok(byId.get("t2")?.deletedAt);
}

// An edit during an upload is picked up in the same run.
{
  const { local, deps } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 1)));
  let edited = false;
  local.onSnapshot = () => {
    if (!edited) {
      edited = true;
      local.write((d) => d.transactions.push(expense("t2", 2)));
    }
  };
  assert.deepEqual(await backUpOnce(deps()), { kind: "uploaded", revision: 2 });
  assert.equal(hasPendingChanges(local.state), false);
}

// Concurrent uploads (two tabs, no lock): the server head only moves forward and everything ends confirmed.
{
  const { local, server, deps, deviceId } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 1)));
  const heads: number[] = [];
  const commit = server.commit.bind(server);
  server.commit = async (input) => {
    const r = await commit(input);
    heads.push(server.heads.get(deviceId)!);
    return r;
  };
  const [a, b] = await Promise.all([backUpOnce(deps()), backUpOnce(deps())]);
  assert.ok([a.kind, b.kind].every((k) => k === "uploaded" || k === "up-to-date"));
  assert.deepEqual(heads, [...heads].sort((x, y) => x - y));
  assert.equal(local.state.confirmedRevision, local.state.localRevision);
  // A stale revision (older than what the server has) never replaces the newer backup.
  const before = server.latest(deviceId);
  const stale = await server.commit({ ...before, snapshotId: newId(), revision: before.revision - 1 > 0 ? before.revision - 1 : 0 });
  assert.equal(stale.status, "stale");
  assert.equal(server.latest(deviceId).snapshotId, before.snapshotId);
}

// Server is ahead of this device (data doesn't match that chain) → stop, ask the user, never overwrite.
{
  const { local, server, deps, deviceId } = await setup();
  server.heads.set(deviceId, 99);
  local.write((d) => d.transactions.push(expense("t1", 1)));
  assert.deepEqual(await backUpOnce(deps()), { kind: "blocked", reason: "conflict" });
  assert.equal(server.snapshots.size, 0);
  assert.equal(syncStatus(local.state, false), "recovery-required");
  const calls = server.calls;
  assert.deepEqual(await backUpOnce(deps()), { kind: "blocked", reason: "conflict" }); // stays stopped
  assert.equal(server.calls, calls);
}

// Missing keys (e.g. site data cleared, then backup re-enabled without the recovery key) → recovery required.
{
  const { local, server, deps } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 1)));
  assert.deepEqual(await backUpOnce(deps({ keys: null })), { kind: "blocked", reason: "keys-missing" });
  assert.equal(server.calls, 0);
  assert.equal(syncStatus(local.state, false), "recovery-required");
}

// Signed out (login rejected) → recovery required; the change stays queued.
{
  const { local, deps } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 1)));
  const remote: SyncRemote = { commit: async () => Promise.reject(new RemoteError("Invalid login", "auth")) };
  assert.deepEqual(await backUpOnce(deps({ remote })), { kind: "blocked", reason: "signed-out" });
  assert.ok(hasPendingChanges(local.state));
}

// Invalid local data is never uploaded.
{
  const { local, server, deps } = await setup();
  local.write((d) => d.transactions.push({ ...expense("t1", 1), accountId: "missing" }));
  assert.equal((await backUpOnce(deps())).kind, "failed");
  assert.equal(server.calls, 0);
  assert.ok(hasPendingChanges(local.state));
}

// Wrong key, corrupted payloads, and moved snapshots are rejected on restore.
{
  const { local, server, deps, deviceId, dek } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 1)));
  await backUpOnce(deps());
  const s = server.latest(deviceId);
  const ctx = contextOf(s, "user-a");
  const otherKey = (await createDataKey((await deriveFromRecoveryKey(crypto.getRandomValues(new Uint8Array(20)), "x.invalid")).kek)).dek;
  await assert.rejects(openSnapshot(otherKey, s, ctx), /can't be decrypted/);
  // Corrupted bytes: the checksum catches it.
  const bytes = fromBase64(s.ciphertext);
  bytes[5] ^= 1;
  await assert.rejects(openSnapshot(dek, { ...s, ciphertext: toBase64(bytes) }, ctx), /damaged/);
  // Tampered with a recomputed checksum: authenticated decryption still fails.
  const { sha256Hex } = await import("@/lib/sync/crypto");
  await assert.rejects(openSnapshot(dek, { ...s, ciphertext: toBase64(bytes), sha256: await sha256Hex(bytes) }, ctx), /can't be decrypted/);
  // Same ciphertext presented as another user's / revision's snapshot: rejected.
  await assert.rejects(openSnapshot(dek, s, { ...ctx, userId: "user-b" }), /can't be decrypted/);
  await assert.rejects(openSnapshot(dek, s, { ...ctx, revision: ctx.revision + 1 }), /can't be decrypted/);
  // Decrypts but isn't a valid backup → validation rejects it (nothing would be written).
  assert.equal(validateBackup({ app: "moneytrack", schemaVersion: 3, data: { accounts: "nope" } }).ok, false);
}

// Restore after local data is cleared: only the recovery key survives; it re-derives the login and unwraps the key.
{
  const { recovery, credentials, wrapped, local, server, deps, deviceId } = await setup();
  local.write((d) => d.transactions.push(expense("t1", 4200), expense("t2", 99)));
  await backUpOnce(deps());
  // Site data cleared: dek, local state, and data are gone. The user types the recovery key.
  const parsed = await parseRecoveryKey(recovery);
  assert.ok(parsed.ok);
  const again = await deriveFromRecoveryKey(parsed.bytes, "example.invalid");
  assert.deepEqual(again.credentials, credentials); // same cloud login
  const dek = await unwrapDataKey(again.kek, wrapped); // wrapped key fetched from the server
  const backup = await decryptLatest(server, deviceId, dek);
  assert.equal(backup.data.transactions.filter((t) => !t.deletedAt).length, 2); // preview count
}

// The server's answer is validated: anything unexpected is an error, never "stored".
assert.deepEqual(parseCommitResult({ status: "ok", revision: 3, createdAt: ts, headRevision: 3 }), { status: "ok", revision: 3, createdAt: ts, headRevision: 3 });
assert.deepEqual(parseCommitResult({ status: "stale", headRevision: 5 }), { status: "stale", headRevision: 5 });
assert.throws(() => parseCommitResult({ status: "ok" }), RemoteError);
assert.throws(() => parseCommitResult(null), RemoteError);
assert.throws(() => parseCommitResult({ status: "saved", revision: 1, createdAt: ts }), RemoteError);

// "Last backup" wording.
{
  const now = new Date(2026, 9, 13, 12, 0);
  assert.equal(formatSince(undefined, now), null);
  assert.equal(formatSince(new Date(2026, 9, 13, 11, 59, 40).toISOString(), now), "just now");
  assert.equal(formatSince(new Date(2026, 9, 13, 11, 55).toISOString(), now), "5 min ago");
  assert.equal(formatSince(new Date(2026, 9, 13, 9, 0).toISOString(), now), "3 h ago");
  assert.equal(formatSince(new Date(2026, 9, 12, 8, 0).toISOString(), now), "yesterday");
  assert.equal(formatSince(new Date(2026, 9, 2, 8, 0).toISOString(), now), "2 Oct");
  assert.equal(formatSince(new Date(2025, 11, 30, 8, 0).toISOString(), now), "30 Dec 2025");
}

// State parsing is defensive.
assert.deepEqual(normalizeSyncState(null), { localRevision: 0, confirmedRevision: 0, enabled: false, deviceId: undefined, userId: undefined, inflight: undefined, lastConfirmedAt: undefined, failures: 0, lastError: undefined, blocked: undefined });
assert.equal(normalizeSyncState({ localRevision: -3, blocked: "nonsense" }).localRevision, 0);

console.log("All sync checks passed");
