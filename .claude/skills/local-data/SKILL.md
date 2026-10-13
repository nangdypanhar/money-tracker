---
name: local-data
description: MoneyTrack's local-first data layer — IndexedDB schema and versioned migrations, repository pattern, record shape for future sync, backup/restore file format, and app lock/encryption rules. Load before changing storage, backups, import/export, PIN/lock, or anything that persists user data.
---

# MoneyTrack local data, backup & security

MoneyTrack has no backend. The user's IndexedDB is the **only** copy of their data unless they export a
backup, so treat every storage change as potentially data-destroying.

## 1. IndexedDB access

- Use the **native IndexedDB API** wrapped in a small promise helper in `src/lib/db`. Don't add a wrapper
  library (`idb`, Dexie, localForage, …) without asking the user first.
- Only `src/lib/db` opens the database. Features use **repositories** (`accountsRepo`, `transactionsRepo`,
  …) that expose typed methods; React components never touch `IDBDatabase` directly.
- Access IndexedDB on the client only (guard for SSR — no `indexedDB` during server render).
- Multi-record writes that must stay consistent (e.g. a transfer + its fee, deleting an account's data)
  happen in **one transaction**.
- `localStorage` is only for non-sensitive UI preferences (theme, data mode). Financial data never goes there.
- **Real vs. demo:** two separate databases — `moneytrack` (the user's data) and `moneytrack-demo` (sample
  data, seeded once by `seedDemoIfNeeded`). The mode lives in localStorage (`lib/db/mode.ts`) and is read when
  the DB opens. Switching or wiping a database goes through `restartApp()` (full reload) so the data provider
  and PIN lock start over. Never write demo records into the real database, and never set a PIN in demo mode.
- Clearing: `clearAppCacheAndReload()` removes the service worker + Cache Storage and **keeps** data;
  `public/reset.html` does the same without the app and must never delete data (it isn't behind the PIN).
  `resetEverything()` is the only full wipe (both databases, PIN, `moneytrack:*` settings) and is behind a confirm.
- First-run seeding must stay idempotent (fixed ids + one shared promise): React runs effects twice in dev.

## 2. Record shape

Every persisted entity has:

```ts
interface BaseRecord {
  id: string;          // crypto.randomUUID()
  createdAt: string;   // ISO timestamp
  updatedAt: string;   // ISO timestamp, bumped on every change
  deletedAt?: string;  // soft delete (tombstone) — keeps future sync possible
}
```

- Prefer soft delete for user data so a future Google Drive sync can propagate deletions. A permanent
  "purge" may exist but must be explicit.
- Money fields follow the `financial-rules` skill (integer minor units + currency).
- Stores: `accounts`, `categories`, `transactions`, `budgets`, `goals`, `goalEntries`, `shoppingItems` (v2), `shoppingLists` (v3),
  `settings`, `meta`. Add indexes for common queries (e.g. transactions by `date`,
  `accountId`, `categoryId`).

## 3. Migrations

- The DB version is a single constant. Each bump has a migration step in `onupgradeneeded` that runs in
  order (`v1→v2→v3…`) and never assumes the user is on the previous version.
- Migrations must be **non-destructive**: transform data, don't drop stores that contain user data
  without an explicit plan approved by the user.
- When the schema changes, also bump the backup `schemaVersion` and add an import upgrader (§4).
- Handle `onblocked`/`versionchange` (another tab open) by prompting a reload, not by failing silently.

## 4. Backup & restore

Backup is a JSON file the user downloads (Blob + `<a download>`, or the File System Access API where
supported — no extra packages).

```jsonc
{
  "app": "moneytrack",
  "schemaVersion": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "encrypted": false,
  "data": { "accounts": [...], "transactions": [...], ... }
}
```

- Export includes soft-deleted records so restore/sync stays faithful.
- **Import must validate** before writing: correct `app`, known `schemaVersion` (upgrade older versions
  step by step; reject newer ones with a clear message), required fields, integer amounts, referential
  integrity (transactions point to existing accounts/categories).
- After validation the user **chooses** in `ImportChoiceDialog` (`features/backup`): **Merge**, **Replace**, or
  Cancel, with a "Download this device's data first" button. Never import without that choice.
- **Replace** (`restoreBackup`): clear + write every store in one transaction.
- **Merge** (`mergeBackup` → pure `mergeBackupData` in `lib/backup/merge.ts`):
  - Match records by `id` in every data store. A record on only one side is kept, so nothing is lost.
  - Same `id` on both sides: the later `updatedAt` wins; a tie keeps this device's copy.
  - `deletedAt` is an ordinary update: a newer delete beats an older edit, a newer edit/restore beats an older
    delete. A record *missing* from the backup is not a delete.
  - This device's settings and PIN are kept.
  - Default categories and Cash accounts have fixed ids, so they merge instead of duplicating. Records entered
    separately on two devices have different ids and are both kept (no fuzzy de-duplication).
  - The merged result is run through `validateBackup` before writing; if it fails, nothing is written. The write
    is one transaction.
  - Merging is idempotent: merging the same backup twice changes nothing the second time.
  - Cloud recovery (§6) reuses these merge rules — keep them in sync.
- Both modes keep the PIN. Tests for validation and merge live in `scripts/finance-check.ts`
  (`pnpm check:finance`); extend them when the rules change.
- Never partially import: if validation fails, write nothing.
- **Keeping data safe from the browser** (`lib/db/storage.ts`): the app calls `navigator.storage.persist()` on
  start (real mode) so the browser won't evict data when space is low; the Backup screen shows whether it was
  granted. It does **not** protect against the user clearing site data or uninstalling — on Android the installed
  app shares Chrome's storage, so "Clear browsing data → Cookies and site data" deletes it. Backups are the
  real protection.
- **Last backup** is device-local: `meta.lastBackupAt`, set after a download or a completed share (never in the
  backup file, never in demo mode). `BackupReminder` on Home shows when there are transactions and no backup
  for 7+ days (pure rules in `lib/backup/reminder.ts`, tested in `check:finance`); "Later" snoozes 3 days via
  localStorage. "Save to Files or Drive" uses the Web Share API with the file and only shows where
  `navigator.canShare({ files })` is true.
- Encrypted backups (future) set `"encrypted": true` and wrap `data` as a Web Crypto payload (see §5).

## 5. App lock & encryption

Current scope (v1): an **app lock** (PIN and/or device-supported auth), not full data encryption — be honest
in UI copy about what it protects.

- Never store a PIN in plain text. Derive a hash with **PBKDF2 (Web Crypto)** + random salt + high
  iteration count; compare in constant-ish time.
- PINs are **4 or 6 digits** (user's choice on the Security screen); `pinLength` is stored with the hash so
  the lock screen unlocks on the last digit with no OK button. PINs saved before that field existed fall
  back to an OK button and record their length on the next successful unlock.
- Lock on app start and after a configurable inactivity timeout / when the app goes to background.
- Rate-limit failed attempts (increasing delay). Do not wipe data on failed attempts unless the user
  explicitly enabled that option.
- Keep a single `crypto` seam in `src/lib/security` (e.g. `encrypt(bytes)` / `decrypt(bytes)` using
  AES-GCM with a PBKDF2-derived key) so stronger at-rest encryption can be added later through the
  repository layer **without rewriting features**. Don't implement at-rest encryption until asked.
- Never log financial data or secrets to the console in production code.

## 6. Optional encrypted cloud backup (Supabase)

Off until the user turns it on (Backup screen → Cloud backup toggle → consent drawer). Local saves never wait
for the network; IndexedDB stays the primary copy. Code: `lib/sync/` (pure engine + crypto + fetch client +
IndexedDB adapter), `features/sync/` (provider, panel, drawers), SQL in `supabase/`.

- **Change tracking:** `withTransaction` bumps `syncState.localRevision` in the *same* transaction as every write
  to a backed-up store (`BACKED_UP_STORES` in `lib/db/idb.ts`) and notifies `onLocalChange`. Pending =
  `localRevision > confirmedRevision`. Never detect changes by timestamps or record counts. Writes to
  `syncState`/`syncKeys` must not bump the revision. Any new write path must go through `withTransaction`.
- **Upload** (`backUpOnce` in `lib/sync/engine.ts`): read every store + the revision in one read-only transaction,
  `validateBackup`, gzip, AES-GCM encrypt, then `commit_backup` RPC. `confirmedRevision` moves **only** after the
  server answers ok/duplicate (parsed strictly by `parseCommitResult`). Retries reuse the in-flight snapshot id
  (idempotent). `stale` = server already has that revision or newer from this device → confirmed up to its head;
  server head > local revision → `blocked: "conflict"` (stop, never overwrite; user reconnects = new chain).
- **Triggers** (`features/sync/sync-provider.tsx`): debounced change (5 s, ≥30 s apart), hidden/pagehide
  (best effort, `keepalive` only under 64 KB), app open/foreground, `online`, "Back up now". Failures retry with
  back-off while open. One upload at a time across tabs (`navigator.locks`). No guarantee anything finishes when
  the app closes — say so in UI copy; correctness comes from the persisted revision, not from timers.
- **Crypto** (`lib/sync/crypto.ts`, Web Crypto only): recovery key = 160 random bits + checksum (9 groups of 4).
  HKDF-SHA-256 → (a) login email/password for Supabase Auth (no email sent; "Confirm email" must be off),
  (b) KEK. Random AES-256-GCM data key (DEK) is wrapped by the KEK; only the wrapped DEK goes to the server, in
  `backup_keys` (separate from snapshots). Each snapshot's GCM additional data binds
  `[format, userId, deviceId, snapshotId, revision]`. The device keeps a non-extractable DEK + derived login in
  `syncKeys`; the recovery key itself is never stored. Never log keys, plaintext, or credentials.
- **Server** (`supabase/migrations/0001_cloud_backup.sql`): RLS on all tables, users read only their own rows,
  snapshots are written only via `commit_backup` (security definer: ownership check, row lock, dedupe, stale
  check, retention = newest 10 + newest per day for 30 days) and deleted via `delete_my_backups`. Only the
  publishable/anon key is in the client; never the service-role key.
- **Recovery:** Restore from cloud → recovery key → sign in → unwrap DEK → list snapshots → download, verify
  SHA-256, decrypt, `validateBackup` → preview counts → user picks Replace or Merge (never automatic). The device
  then starts a **new** device chain (new `deviceId`) so revisions never collide.
- **Demo mode never syncs.** Erase all data doesn't reset `syncState` (an erase is a change to back up).
- Tests: `pnpm check:sync` (engine + crypto with in-memory fakes); `supabase/tests/backup_rls.sql` (RLS, run on a
  test project). Extend both when the rules change.

## 7. Future integrations (do not build unless asked)

- **Multi-device live sync / Google Drive:** would reuse the backup format and `mergeBackupData` (id +
  `updatedAt`, honoring `deletedAt`). Keep the backup format stable and versioned.
- **Notifications:** budget/goal alerts will be computed by pure functions in `lib/finance`; a notifier
  (Notification API / push) subscribes later.

## 8. Checklist before finishing data work

- [ ] Schema change → DB version bumped, migration added, backup `schemaVersion` + import upgrader updated.
- [ ] Old backups still import; newer-than-supported backups are rejected clearly.
- [ ] New store or record type → added to `MERGED_STORES` / `mergeBackupData`, with a merge test.
- [ ] Multi-record writes are atomic, and go through `withTransaction` (so cloud backup sees them).
- [ ] Nothing sensitive in `localStorage` or logs.
- [ ] Works offline and with SSR (no `indexedDB`/`window` access on the server).
