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
- Planned stores (adjust when implemented): `accounts`, `categories`, `transactions`, `budgets`, `goals`,
  `goalEntries`, `settings`, `meta`. Add indexes for common queries (e.g. transactions by `date`,
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
- Restore is **replace** (clear + write in one transaction) unless a merge mode is explicitly built.
  Always confirm with the user in the UI before replacing, and suggest exporting first.
- Never partially import: if validation fails, write nothing.
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

## 6. Future integrations (do not build unless asked)

- **Google Drive sync:** will upload/download the backup format above and merge by `id` + `updatedAt`,
  honoring `deletedAt` tombstones. Keep the backup format stable and versioned with that in mind.
- **Notifications:** budget/goal alerts will be computed by pure functions in `lib/finance`; a notifier
  (Notification API / push) subscribes later.

## 7. Checklist before finishing data work

- [ ] Schema change → DB version bumped, migration added, backup `schemaVersion` + import upgrader updated.
- [ ] Old backups still import; newer-than-supported backups are rejected clearly.
- [ ] Multi-record writes are atomic.
- [ ] Nothing sensitive in `localStorage` or logs.
- [ ] Works offline and with SSR (no `indexedDB`/`window` access on the server).
