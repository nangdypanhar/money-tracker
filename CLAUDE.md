# CLAUDE.md

Instructions for Claude Code (and other AI agents) working in this repository.

## Project

**MoneyTrack** is a mobile-first, local-first personal finance PWA. It covers:
income, expenses, transfers, budgets, accounts, savings goals, reports, backups, and app security (lock screen).

There is **no backend**. All data lives on the device in IndexedDB. The architecture must stay ready for
future Google Drive sync, notifications, and stronger local encryption — but **do not implement those
integrations unless explicitly asked**.

> **Status:** the repository has not been scaffolded yet, and the sample UI has not been added.
> Sections marked **TBD** must be filled in once those exist. Do not invent values for them.

## Tech stack

| Concern    | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| Framework  | Next.js (App Router) + TypeScript (strict)                 |
| Styling    | Tailwind CSS                                               |
| Components | shadcn/ui (generated into `src/components/ui`)             |
| Font       | Poppins via `next/font/google` — used everywhere           |
| Storage    | IndexedDB (native API behind a repository layer)           |
| PWA        | Web app manifest + service worker (native, no plugin yet)  |
| Crypto     | Web Crypto API (`crypto.subtle`, `crypto.randomUUID`)      |

## Hard rules

1. **No dependency changes without asking.** Do not install, remove, upgrade, downgrade, or add any
   package, library, CLI, extension, or tool without explicit approval from the user first. This includes
   `npx shadcn add …` (it writes files and may add deps) — ask before running it.
   When something seems to need a new package, first check existing deps and native browser APIs, then
   propose the package with a one-line justification and wait.
2. **No other UI/CSS framework.** Only Tailwind CSS + shadcn/ui. No MUI, Chakra, Bootstrap, styled-components,
   CSS-in-JS, or extra icon/animation kits unless approved.
3. **The sample UI is the visual source of truth.** Keep its layout, spacing, typography, colors, and
   component style. Don't "improve" the design unless asked. See [Design system](#design-system).
4. **Poppins everywhere.** No other font families, including in charts and dialogs.
5. **Financial correctness first.** Transfers and savings movements are **never** income or expenses.
   Before touching anything that computes money, load the `financial-rules` skill
   (`.claude/skills/financial-rules/SKILL.md`).
6. **Local-first.** No network calls for core features. The app must fully work offline.
7. **No speculative integrations.** Leave clean seams (interfaces) for sync, notifications, and encryption,
   but don't build them until asked.
8. **Don't break user data.** Any IndexedDB schema change needs a versioned migration and must keep backups
   importable. Load the `local-data` skill (`.claude/skills/local-data/SKILL.md`) before touching storage,
   backup/restore, or security.

## Commands

Package manager: **pnpm**. Node 24 via nvm (`nvm use 24`; Node is not on the default PATH here).

```bash
pnpm dev         # start dev server
pnpm build       # production build
pnpm lint        # ESLint
pnpm typecheck   # tsc --noEmit
```

No test runner yet. Adding one (e.g. Vitest) needs the user's approval.

## Architecture

Planned layout (adjust this section to match reality once scaffolded):

```
src/
  app/                    # Next.js routes (App Router), layouts, manifest
  components/
    ui/                   # shadcn/ui generated components — keep close to upstream
    <feature>/            # feature-specific presentational components
  features/               # one folder per domain: accounts, transactions, transfers,
                          # budgets, goals, reports, backup, security, settings
  lib/
    money/                # Money type, parsing, formatting (integer minor units)
    finance/              # pure calculations: balances, budgets, reports, goals
    db/                   # IndexedDB open/migrations + repositories
    security/             # PIN/lock, Web Crypto helpers, encryption seam
  integrations/           # future: drive-sync, notifications (interfaces only, when asked)
public/                   # icons, service worker
docs/sample-ui/           # the sample UI reference (screenshots/exports)
```

Layering — dependencies only point downward:

```
app/ (routes)  →  features/ + components/  →  lib/finance (pure)  →  lib/money
                                           →  lib/db (repositories) →  IndexedDB
```

- `lib/finance` and `lib/money` are **pure TypeScript**: no React, no IndexedDB, no `Date.now()` inside
  calculations (pass dates in). They're the easiest place to unit test and must be kept that way.
- UI components never talk to IndexedDB directly; they go through repositories / feature hooks.
- Balances, budget usage, and report totals are **derived** from transactions, not stored as editable
  running totals.
- Anything touching `window`, `indexedDB`, or `crypto` runs client-side only (`"use client"` or guarded).

### Future-ready seams (interfaces only)

- **Sync:** every record has a UUID `id`, `createdAt`, `updatedAt`, and soft-delete `deletedAt`, so a later
  Google Drive sync can merge by id/timestamp.
- **Encryption:** storage goes through a repository layer so an encrypt/decrypt step can be added
  without rewriting features.
- **Notifications:** budget/goal events should be computed by pure functions so a notifier can subscribe later.

## Design system

Source: `docs/sample-ui/image.png` (Monthly budget, Budgeting Breakdown, Report). Look at it before any UI
work. Tokens live as CSS variables in `src/app/globals.css`; use them via Tailwind classes, never raw hex.

**Theme — dark only (for now).**

| Token                | Value (approx.)       | Used for                                                  |
| -------------------- | --------------------- | --------------------------------------------------------- |
| `background`         | `#05050c` near-black  | page                                                      |
| header glow          | radial `#2a2160` → transparent | soft purple glow behind the top header           |
| `card`               | `#0f0f26` navy        | cards / panels, with subtle top highlight gradient        |
| `border`             | `#24244a`             | 1px card, chip, and pill borders                          |
| `primary`            | `#4f3fc4` indigo      | active month pill, active nav item, primary chip          |
| `muted-foreground`   | `#9a9ab8`             | secondary text ("Completed", "Than last month", info rows)|
| `income`             | `#2fd47a` green       | `+$13.82`, positive deltas                                |
| `expense`            | `#f0473e` red         | `-$10.33`, negative deltas, expense status badge          |
| `chart-1..6`         | blue `#2f6bff`, green `#22c99a`, orange `#f2895f`, cyan `#5ac8e4`, violet `#6a4bff`, amber `#f5a64a` | category dots, bar segments, gauge |

**Type.** Poppins only. Headers ~20px/500, centered. Hero amounts large (~28–32px) and semibold with
`tabular-nums` (the sample shows monospaced figures; we get aligned digits from Poppins tabular numerals
rather than adding a mono font). Body 14px; secondary 12px muted.

**Shape & spacing.** Cards radius ~20px (`rounded-2xl`/`3xl`) with 1px border; chips and pills are fully
rounded (`rounded-full`). Screen side padding 16px; card padding ~16–20px; gaps 8–12px.

**Patterns from the sample:**

- **Screen header:** circular ghost back button (left), centered title, optional pill action on the right
  ("Download ⤓").
- **Month selector:** horizontally scrollable pills; the selected month is filled `primary`, the others
  have a border. Edge items fade/clip.
- **Spending gauge:** semicircle of rounded "tick" segments colored by category share, remaining segments
  dim; total in the center ("Total spend $4,100.00").
- **Category chips:** pill with colored dot + name + amount, wrapping in rows.
- **Stacked bar:** rounded segments with small gaps, colored by category.
- **Stat tiles:** small card with icon + label, value, and a colored delta "+4.7% Than last month".
- **Info row:** ⓘ icon + muted 12px text ("Your monthly spending limit is $10,000").
- **Segmented filter:** pill buttons (Expenses / Budget / Income), the active one filled `primary`.
- **Transaction row:** circular icon with a small status badge (red for out, green for in), title +
  "Completed" subtitle; right side: signed colored amount + time. Grouped under "Today" etc.
- **Line chart:** thin colored lines on dark, muted axis labels; legend tiles below ("Total transfer in /
  out").
- **Bottom nav:** floating, rounded pill bar centered above the home indicator, 4 icons
  (home, calendar, chart, profile); active item is a filled `primary` circle/pill.

Other rules:

- Mobile-first: design for ~360–430px wide first; on wider screens keep the app in a centered phone-width
  column. Respect safe-area insets for the PWA.
- Touch targets ≥ 44px. Numeric inputs use `inputMode="decimal"`.
- Theme via shadcn CSS variables in the global stylesheet — no hard-coded hex values in components.

## Coding conventions

- TypeScript strict; avoid `any`. Model domain types explicitly (`Account`, `Transaction`, `Budget`, …).
- Money is an integer in minor units with a currency code — **never** a JS float. See `financial-rules`.
- Keep files small and feature-scoped; prefer composition over large components.
- Match the surrounding code's style and comment density.
- Accessible by default: labels on inputs, semantic buttons, visible focus states.

## Workflow

- Read relevant existing code and the sample UI before changing anything.
- For money logic: add or update unit tests for the pure functions (once a test runner is approved/set up).
- When a request is ambiguous about financial behavior (e.g. how a refund or cross-currency transfer should
  count), ask instead of guessing.
- Keep `README.md` and this file accurate when architecture or commands change.

## Skills

| Skill             | Use when                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| `financial-rules` | Anything that creates, edits, or computes money: transactions, balances, budgets, goals, reports |
| `local-data`      | IndexedDB schema/migrations, repositories, backup/restore, PIN/lock, encryption |
