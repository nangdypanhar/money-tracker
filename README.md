# MoneyTrack

A mobile-first, local-first personal finance **PWA** for tracking income, expenses, transfers, budgets,
accounts, savings goals, and reports — with backups and an app lock. All data stays on your device;
no account or backend required.

> **Status:** early setup. The project has not been scaffolded yet and the sample UI is pending
> (`docs/sample-ui/`). Sections marked **TBD** will be filled in as the project takes shape.

## Features (planned)

- **Accounts** — cash, bank, e-wallet, credit; opening balances; archive
- **Transactions** — income and expenses with categories, notes, and dates
- **Transfers** — move money between accounts (never counted as income or expense)
- **Budgets** — monthly limits per category with progress and over-budget states
- **Savings goals** — targets, contributions, withdrawals, progress
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
```

## Architecture

```
src/
  app/            Next.js routes, layouts, manifest
  components/ui/  shadcn/ui components
  components/     feature UI components
  features/       domain modules (accounts, transactions, budgets, goals, reports, backup, security)
  lib/money/      money type & formatting (integer minor units)
  lib/finance/    pure calculations (balances, budgets, goals, reports)
  lib/db/         IndexedDB setup, migrations, repositories
  lib/security/   app lock & crypto helpers
public/           icons, service worker
docs/sample-ui/   visual reference for the UI
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

**TBD** — will describe adding accounts, recording transactions/transfers, setting budgets and goals,
viewing reports, backing up/restoring, enabling the app lock, and installing the PWA.

## Privacy

Your financial data never leaves your device unless you export a backup yourself.
