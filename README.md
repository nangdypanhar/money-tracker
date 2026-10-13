# MoneyTrack

A mobile-first, local-first personal finance **PWA** for tracking income, expenses, transfers, budgets,
accounts, savings goals, and reports — with backups and an app lock. All data stays on your device;
no account or backend required.

## Features

- **Accounts** — cash, bank, e-wallet, credit; US dollar or Cambodian riel; opening balances; archive
- **Dollar & riel** — switch between $ and ៛ views; totals are never mixed (exchange = a transfer)
- **Transactions** — income and expenses with categories, notes, and dates
- **Transfers** — move money between accounts (never counted as income or expense)
- **Budgets** — monthly limits per category with progress and over-budget states
- **Savings goals** — targets, contributions, withdrawals, progress
- **Shopping list** — things you need (required) or want to buy, in named lists, grouped by priority, list,
  day, week, or month
- **Hide balances** — eye button blurs balances ABA-style; remembered on the device
- **Reports** — income vs. expenses, category breakdowns, net cash flow, per-currency totals
- **Backup & restore** — export/import a versioned JSON file
- **Security** — PIN app lock
- **Installable & offline** — PWA, works without a network

Future (not yet implemented): Google Drive sync, notifications, stronger at-rest encryption.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- Poppins font (via `next/font/google`)
- IndexedDB for local storage (native API)
- Web Crypto API for PIN hashing and future encryption
- PWA: web app manifest + service worker

## Getting started

Requirements: Node.js 20.9+ (developed on Node 24) and pnpm.

```bash
pnpm install     # install dependencies
pnpm dev         # start the dev server at http://localhost:3000
pnpm build       # production build
pnpm lint        # lint
pnpm typecheck   # type-check
pnpm check:finance  # verify money calculations
pnpm check:sync     # verify cloud backup (engine + encryption)
```

The service worker (offline support) is only registered in production builds (`pnpm build && pnpm start`).
To try the app with sample data, switch to **Demo** (More → Data, or **Try demo** on an empty home screen).
Demo data lives in a separate database, so it never mixes with your own records.

## Install on your phone (PWA)

A phone only installs MoneyTrack as an app from an **https://** address. The LAN dev address
(`http://192.168.1.x:3000`) is for testing only: no install, no offline mode, no PIN lock.

Deploy the app to any HTTPS host at the root of a domain. It needs no server or database — for example
[Vercel](https://vercel.com): **Add New → Project → import this GitHub repo → Deploy** (no settings to change).
Then open the https URL on the phone:

- **Android (Chrome):** More → **Install app** (or browser menu ⋮ → Install app).
- **iPhone (Safari):** Share → **Add to Home Screen**.

After installing, the app works fully offline. New deployments show **New version ready → Reload**.
Data belongs to the address it was entered on, so move existing data with **Backup & restore** (export on the
old address, import on the new one).

## Cloud backup (optional, Supabase)

Off by default. When a user turns it on (More → Backup & restore → **Cloud backup**), the app shows what will
be uploaded, gives them a **recovery key**, and from then on uploads an end-to-end encrypted snapshot whenever
data changes. The server can't read it. No email sign-up: the recovery key is the login and the decryption key,
so losing it (together with the device's data) makes the backup unrecoverable.

One-time server setup:

1. Copy `.env.example` to `.env` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (the **publishable** key — never the service-role/secret key). Set the same variables on your host
   (e.g. Vercel → Settings → Environment Variables) and redeploy.
2. Supabase → SQL Editor: run `supabase/migrations/0001_cloud_backup.sql`.
3. Supabase → Authentication → Sign In / Providers → Email: turn **off** "Confirm email".
4. Optional check: run `supabase/tests/backup_rls.sql` in the SQL editor of a **test** project (it rolls back).

Recovery after browser data is cleared: open the app → More → Backup & restore → **Restore from cloud** → enter
the recovery key → pick a backup → check the preview → **Replace** (or **Merge**). A restore is a one-time copy:
it doesn't connect the device to that backup. To back up the device again, turn on Cloud backup there (it gets its
own recovery key). Uploads are attempted when
data changes, when the app is hidden or reopened, and when the connection returns — closing the app doesn't
guarantee the last changes were uploaded; they go up the next time it's open.

## Architecture

```
src/app/            screens (home, history, budget, breakdown, report, accounts, goals, …)
src/components/ui/  shadcn/ui components
src/components/     app shell and finance UI (gauge, charts, transaction list)
src/features/       data provider, transaction drawer, PIN lock
src/lib/money/      money parsing & formatting (integer minor units)
src/lib/finance/    pure calculations (balances, budgets, goals, reports)
src/lib/db/         IndexedDB setup, migrations, repositories
src/lib/backup/     JSON backup, replace or merge import, CSV export
src/lib/sync/       optional encrypted cloud backup (engine, crypto, Supabase client)
src/lib/security/   PIN hashing (Web Crypto)
public/             icon, service worker
docs/sample-ui/     visual reference for the UI
```

Key principles:

- **Local-first** — IndexedDB is the source of truth; everything works offline.
- **Accurate money** — amounts are integers in minor units; balances and totals are derived from
  transactions; transfers and savings are never counted as income or expenses.
- **Modular** — UI → features → pure finance logic → repositories → IndexedDB, so sync, notifications,
  and encryption can be added later without rewrites.

Detailed rules live in:

- [`CLAUDE.md`](./CLAUDE.md) — contributor & AI-agent instructions
- [`.claude/skills/financial-rules/SKILL.md`](./.claude/skills/financial-rules/SKILL.md) — accounting rules
- [`.claude/skills/local-data/SKILL.md`](./.claude/skills/local-data/SKILL.md) — storage, backup, security

## Usage

- **Add a transaction:** the **+** button (Home or History) or the Expense / Income / Transfer shortcuts.
  Tap any transaction to edit or delete it.
- **History calendar:** each day shows what you spent (green dot = income). Tap a day to see only that day;
  **+** then adds a transaction on that date.
- **Transfers** move money between your accounts. An optional fee is recorded as a separate expense.
- **Accounts** (More → Accounts): set an opening balance, archive old accounts, or *Adjust balance* to match
  your bank — adjustments never count as income or spending.
- **Budgets** (Budget tab → ⚙): a monthly spending limit plus optional per-category limits.
- **Savings goals** (More → Savings goals): add or withdraw money; it moves between an account and the goal.
- **Shopping list** (More → Shopping list, or the card on Home): mark items *Need* or *Want* and put them in
  lists (tap **+ List**; tap a selected list again to edit it). *Group by* Priority, List, Day, Week, or Month,
  using each item's "When to buy" date. Ticking one off doesn't change any balance — tap *Record expense* on
  the toast to log the purchase.
- **Dates**: tap a date field for a calendar, use a quick pick (Today, Tomorrow…), or tap ⌨ to type it
  day-first (15/10/2026).
- **Hide balances** (eye on Home, Accounts, Savings goals): blurs balances and totals; transaction history
  stays visible.
- **Reports** (Budget → Report): income by category, cash flow, savings rate; **Download** exports the month as CSV.
- **Backup** (More → Backup & restore): export/import a JSON file. Importing first shows exactly what it would add,
  change, or remove (or "Already up to date"); **Add these changes** merges it (the newer change wins for the same
  record), and **Replace everything instead…** makes the device match the backup. You can download this device's
  data first.
  On phones, **Save to Files or Drive** shares the backup file. Home reminds you when there's been no backup for a
  week. The app asks the browser to keep its storage, but clearing the browser's site data (on Android this
  includes the installed app) still deletes it, so keep backups.
- **Demo / my data** (More → Data): switch between sample data and your own. **Reset demo** restores the
  samples; **Erase all data** (Backup) starts your own data fresh.
- **Clear cache & reload** (More): loads the newest app version; data is kept. If a device is stuck on an old
  version, open `/reset.html` (cache only — it never deletes data).
- **Reset app — delete everything** (More): deletes all data (yours and the demo), the PIN, and settings, like a
  fresh install. Can't be undone.
- **PIN lock** (More → Security): locks on launch and after the chosen time in the background.
- **Install:** use your browser's "Add to Home Screen" / "Install app".

## Privacy

Your financial data never leaves your device unless you export a backup yourself or turn on cloud backup,
which encrypts everything on the device first (AES-256-GCM); the server stores only ciphertext and minimal
metadata (ids, revision numbers, sizes, timestamps).
