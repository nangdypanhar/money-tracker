# CLAUDE.md

Instructions for Claude Code (and other AI agents) working in this repository.

## Project

**MoneyTrack** is a mobile-first, local-first personal finance PWA. It covers:
income, expenses, transfers, budgets, accounts, savings goals, reports, backups, and app security (lock screen).

There is **no backend**. All data lives on the device in IndexedDB. The architecture must stay ready for
future Google Drive sync, notifications, and stronger local encryption — but **do not implement those
integrations unless explicitly asked**.

> **Status:** v1 is implemented (all features above, local-only, US dollar + Cambodian riel). Google Drive sync,
> notifications, and at-rest encryption wait for an explicit request.

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
pnpm typecheck       # tsc --noEmit
pnpm check:finance   # money-logic invariants (plain Node, no test framework)
```

Run `typecheck`, `lint`, and `check:finance` before finishing work that touches money logic; extend
`scripts/finance-check.ts` when you add a rule. A full test runner (e.g. Vitest) needs the user's approval.

Verification builds: `NEXT_DIST_DIR=.next-verify pnpm build` writes to a separate folder so a running
`pnpm dev` (which uses `.next`) isn't disturbed — a normal `pnpm build` alongside it can break the dev server.
Next adds that folder to `tsconfig.json` "include"; revert that change afterwards (`git checkout tsconfig.json`).

PWA: `src/app/manifest.ts`, PNG icons in `public/` + `src/app/apple-icon.png`, `public/sw.js` (registered as
`/sw.js?v=<NEXT_PUBLIC_APP_VERSION>`, set per build in `next.config.ts`). If you add a route, add it to `ROUTES`
in `public/sw.js` so it works offline. Installing only works over HTTPS.

`shadcn init` rewrites `src/app/globals.css` and swaps the font to Geist — if it's ever re-run, restore the
MoneyTrack theme and Poppins afterwards. `shadcn add <component>` is fine once approved.

## Architecture

```
src/
  app/                    # routes: / (home), /transactions, /budget (+ /breakdown, /report, /limits),
                          # /more, /accounts, /goals, /shopping, /categories, /backup, /security; manifest.ts
  components/
    ui/                   # shadcn/ui generated (radix-nova) — keep close to upstream
    app/                  # shell: AppShell, BottomNav, ScreenHeader, MonthSelector, form helpers
    finance/              # sample-UI pieces: SpendingGauge, LineChart, StackedBar, chips, TransactionList
  features/
    data/                 # DataProvider (loads IndexedDB into React state, shared month), summaries, demo data
    transactions/         # add/edit transaction drawer (TransactionSheetProvider)
    security/             # LockProvider + PIN pad
    privacy/              # hide/show balances (eye toggle; localStorage UI preference)
  lib/
    money/                # currency table, integer minor-unit parsing/formatting
    finance/              # domain types, dates, pure calculations (balances, budgets, goals, reports)
    db/                   # IndexedDB open + migrations, generic repository, settings, first-run seed
    backup/               # JSON backup build/validate/restore, CSV export
    security/             # PBKDF2 PIN hashing
public/                   # icon, service worker (sw.js, registered in production only)
scripts/                  # finance-check.ts + loader so Node can run src TypeScript
docs/sample-ui/           # the sample UI reference
```

Demo mode uses a separate IndexedDB database (`moneytrack-demo`); see the `local-data` skill. A banner shows
while it's active, and switching is on More → Data.

Data flow: pages read `useData()` (all live records in memory — fine for personal-finance volumes), compute
with `lib/finance`, write through repositories (`lib/db/repositories.ts`), then call `refresh()`.
Forms open in a bottom `FormDrawer`; destructive actions use `useConfirm()`.

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

**Deliberate changes from the sample (requested by the user):** the accent is **blue**, not the sample's
purple, and there is a **light theme** as well as dark (System / Light / Dark on the More screen, via
`next-themes`, class `dark` on `<html>`). Keep the sample's layout, shapes, and patterns in both themes.
Neither theme uses pure white or near-black — the user found those too bright / too dark.

| Token              | Light       | Dark        | Used for                                                    |
| ------------------ | ----------- | ----------- | ----------------------------------------------------------- |
| `background`       | `#e9edf4`   | `#0e1424`   | page                                                        |
| `card`             | `#f6f8fb`   | `#172036`   | cards / panels (`.surface` adds highlight / soft shadow)     |
| `border`           | `#d3dae6`   | `#2b3854`   | 1px card, chip, and pill borders                            |
| `primary`          | `#2a62f0`   | `#3170ff`   | active month pill, active nav item, primary buttons         |
| `muted-foreground` | `#58647a`   | `#a1adc4`   | secondary text, info rows                                   |
| `income`           | `#12a058`   | `#2fd47a`   | `+$13.82`, positive deltas                                  |
| `expense`          | `#d93025`   | `#f0473e`   | `-$10.33`, negative deltas, expense badge                   |
| `glow`             | `#cbd8f3`   | `#1c3366`   | `.header-glow` radial glow behind the top of each screen    |
| `masked`           | `#b4bdcc`   | `#b4bdcc`   | blurred hidden balances — same light grey in both themes, never black |
| `chart-1..6`       | blue, green, orange, cyan, violet, amber (slightly deeper in light) | category dots, bars, gauge |

Accent rule: never green or red (reserved for income/expense).

**Phone status bar:** `--status-bar` (`#d4def3` light / `#182a52` dark, mirrored in `src/lib/theme.ts`) is
the `theme-color`, and the body's top band starts from that exact color, so the bar and the screen blend with
no seam. The app owns the **only** theme-color tag (`#mt-status-bar`): a pre-paint script in `layout.tsx`
creates it, and `StatusBarColorSync` **replaces** it (new element — Android Chrome needs that to repaint
without a reload) in the same frame the theme class changes. Don't add `themeColor` to Next's `viewport`
export: a React-rendered tag with the same color gets confused with ours during hydration and crashes on
replace. Change the colors in both places together.

**Type.** Poppins only. Headers ~20px/500, centered. Hero amounts large (~28–32px) and semibold with
`tabular-nums` (the sample shows monospaced figures; we get aligned digits from Poppins tabular numerals
rather than adding a mono font). Body 14px; secondary 12px muted.

**Shape & spacing.** Cards radius ~20px (`rounded-2xl`/`3xl`) with 1px border; chips and pills are fully
rounded (`rounded-full`). Screen side padding 16px; card padding ~16–20px; gaps 8–12px.

**Patterns from the sample:**

- **Screen header:** circular ghost back button (left), centered title, optional pill action on the right
  ("Download ⤓").
- **Month selector:** Jan–Dec pills for one year (no year suffix on pills); the selected month is filled
  `primary`, the others have a border. Edge items fade/clip. A small "‹ 2025 ›" year switch appears only
  when there's data from another year.
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
- **Currencies (ABA-style):** Home, History tiles, Accounts, and Goals stack a Dollar block on top and a Riel
  block below (`CurrencyTag` heads each). The **chart screens** (Budget, Breakdown, Report) and **Budget
  limits** use a `ChartCurrencyTabs` $/៛ tab instead, to save space; the choice is shared and remembered on the device.
  Accounts are chosen as tappable cards showing each balance in its currency.
- **Hide balances:** an eye button (`BalanceToggle`) blurs balances and totals (Home, Accounts, Goals, account
  picker) via `useBalanceVisibility().balance(...)` — it blurs a fake placeholder figure, never the real one. Use it for new balance displays; history amounts stay visible.
- **Shopping list** (`/shopping`): items are plans (need / want, optional expected price, optional named
  list) and never touch balances or spending; ticking one off offers "Record expense", which prefills the
  transaction sheet. List chips filter; "Group by" Priority / List / Day / Week / Month (weeks start Monday,
  overdue first) comes from the pure `groupShoppingItems` in `lib/finance/shopping.ts`.
- **Choices in forms:** an account is always chosen with `AccountPicker` (`components/app/account-picker.tsx`,
  tappable cards with balances); small fixed choices (type, currency, priority, auto-lock) use `Segmented`
  pills. No dropdowns (`ui/select.tsx` is kept but unused) — reach for one only for long lists.
- **Dates** are picked with `DateField` (`components/app/date-field.tsx`): tap to open an inline calendar,
  quick picks (past set for records, future set for plans), or the keyboard icon to type day-first
  ("15/10", "15/10/2026"). Don't use a bare `<input type="date">`.
- **Date display:** day before month, via `formatDate` in `lib/finance/dates.ts` — "Sat, 17 Nov 2026"
  ("Saturday, 17 Nov 2026" in the date field; year dropped where it's the current year in lists/groups).
  Don't call `toLocaleDateString` for dates directly.
- **Times** are stored "HH:mm" (24-hour, sorts correctly) and shown 12-hour (`formatTime12`: "1:16 PM").
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
