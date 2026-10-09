---
name: financial-rules
description: MoneyTrack's money and accounting rules — money representation, transaction types, how balances, budgets, savings goals, and reports are calculated, and why transfers/savings are never income or expenses. Load before writing or changing any code that creates, edits, or computes money.
---

# MoneyTrack financial rules

These rules are the contract for all money logic. Implement them as **pure functions** in `src/lib/money`
and `src/lib/finance`, with unit tests. If a request conflicts with a rule here, point out the conflict and
ask before changing behavior.

## 1. Representing money

- Store amounts as **integers in minor units** (e.g. USD cents) together with an ISO 4217 currency code:
  `{ amount: number /* integer */, currency: string }`.
- **Never** store or sum floats. Parse user input string → integer minor units once, at the edge.
- Minor-unit digits come from one per-currency config table (e.g. `USD: 2`). Don't hard-code `100`.
  Some currencies are used with 0 practical decimals — confirm with the user before adding a currency.
- Stored amounts on transactions are **always positive**. Direction comes from the transaction type,
  not the sign.
- Format for display only with `Intl.NumberFormat`. Never round stored values for display.
- Percentages (budget used, goal progress) are computed at display time and may be clamped visually,
  but the underlying numbers are not clamped.
- Use `Number.isSafeInteger` to guard amounts.
- Supported currencies (`src/lib/money/currency.ts`): **USD** (2 digits) and **KHR** riel (0 digits — whole
  riel, as used in practice). Each account and goal has one currency; it can't change once it has history.
- **Dollar on top, riel below (user's request, ABA-style):** Home, History tiles, Accounts, and Goals show a
  block per currency in `currencies` from `useData()` (only currencies with active accounts, USD
  first). The chart screens (Budget, Breakdown, Report) and Budget limits show one currency at a time via a $/៛ tab
  (`chartCurrency`). Each block only includes that currency's accounts — `useMonthSummary(month, currency)`,
  `settings.monthlyLimits[currency]`, budgets with that `currency`. Never add the blocks together.
- Default accounts: **Cash** (USD) and **Cash ៛** (KHR, added once — also to older installs).
- Entering money: the user taps an account card (`AccountPicker`); the amount's currency is that account's.
  A dollar→riel transfer asks for the amount received and shows the implied rate (display only).
- Amount inputs format thousands with commas as you type (`formatAmountInput`); `parseAmount` ignores them.

## 2. Transaction types

| Type         | Effect on account balance(s)                  | Counts as income? | Counts as expense? |
| ------------ | --------------------------------------------- | ----------------- | ------------------ |
| `income`     | + to its account                              | **Yes**           | No                 |
| `expense`    | − from its account                            | No                | **Yes**            |
| `transfer`   | − from source account, + to destination       | No                | No                 |
| `adjustment` | ± to its account (balance correction)         | No                | No                 |

Savings goal contributions/withdrawals are covered in §5 — they are **not** income or expenses either.

Rules:

- A **transfer** is one record with `fromAccountId` and `toAccountId` (must differ). It must never be
  split into a fake expense + fake income.
- A transfer **fee** is a separate `expense` (category e.g. "Fees") linked to the transfer, so the fee is
  counted as spending but the moved amount is not.
- **Cross-currency transfers** store both `fromAmount` and `toAmount`. There is no automatic FX in v1;
  the user enters what actually arrived.
- **Opening balance** is a property of the account, not an income transaction. For a **credit card** the
  form asks for the "Amount owed" and stores it negative (no "owed" switch — the user found it confusing);
  existing accounts keep their saved sign unless their type changes.
- **Adjustments** (reconciling to the real bank balance) change the balance but are excluded from income,
  expense, budgets, and reports.
- **Refunds** reduce spending: model as an `expense` with `isRefund: true` (counted negatively in its
  category) rather than as income. Confirm with the user before changing this. The UI no longer offers a
  Refund switch for new entries (the user found it confusing); stored refunds still count everywhere, and the
  switch only appears when editing an existing refund.
- Every income/expense has a category. Transfers and adjustments have no spending category.
- The transaction date is a **local calendar date** (`YYYY-MM-DD`) plus optional time; `createdAt`/
  `updatedAt` are ISO timestamps for auditing and future sync. Period filters use the local date.

## 3. Account balances

```
balance(account) = openingBalance
                 + Σ income
                 − Σ expense            (refunds add back)
                 + Σ transfers in  (toAmount)
                 − Σ transfers out (fromAmount)
                 − Σ goal contributions from this account
                 + Σ goal withdrawals to this account
                 ± Σ adjustments
```

- Balances are **derived** from records; never maintain an editable running balance. A cache is fine only
  if it can be rebuilt from records.
- Soft-deleted records (`deletedAt` set) are excluded everywhere.
- Archived accounts keep their history and still count in historical reports; hide them from pickers.
- Credit/liability accounts may go negative; whether to warn on negative balances for cash/bank accounts
  is a UI decision — don't block it silently.
- **Net worth** = Σ balances of included accounts, grouped **per currency**. Don't add different
  currencies together without an explicit, user-provided rate.

## 4. Budgets

- A budget is a limit for one or more expense categories over a period (monthly by default).
- `spent = Σ expense amounts in those categories within the period − Σ refunds`.
- **Excluded** from `spent`: transfers, adjustments, goal contributions, income, opening balances.
- `remaining = limit − spent` (may be negative = over budget).
- Periods are computed in the user's local time zone; a month runs from the 1st to the last day inclusive.
  A configurable month start day, if added, must be applied consistently in budgets and reports.
- Rollover of unused budget is off unless the user explicitly asks for it.

## 5. Savings goals

- A goal has a `targetAmount`, `currency`, optional `targetDate`, and a history of contributions and
  withdrawals.
- A **contribution** moves money from an account into the goal: it lowers that account's balance
  (available money) but is **not an expense** and does not affect budgets or spending reports.
- A **withdrawal** moves money from the goal back to an account: **not income**.
- `goalBalance = Σ contributions − Σ withdrawals`; `progress = goalBalance / targetAmount`.
- Net worth includes goal balances (money set aside is still the user's money).
- Reports may show "saved this period" as its own figure, separate from income and expenses.

> If the user later wants goals linked to a real savings account instead of earmarked buckets, treat that
> as a design change — ask before migrating.

## 6. Reports

- **Income** = Σ `income` in range. **Expenses** = Σ `expense` in range (net of refunds).
- **Net cash flow** = Income − Expenses. Transfers, adjustments, goal movements, and opening balances are
  excluded.
- **Savings rate** (if shown) = (Income − Expenses) / Income, undefined when income is 0 — show "—", not
  `NaN`/`Infinity`.
- Category breakdowns only include income/expense categories.
- Totals are per currency unless the user supplied conversion rates.
- Report totals must equal the sum of the transactions shown in their drill-down lists.

## 7. Checklist before finishing money-related work

- [ ] No float math on amounts; all sums are integer minor units.
- [ ] Transfers, goal movements, adjustments, and opening balances are excluded from income/expense,
      budgets, and reports.
- [ ] Soft-deleted records are excluded.
- [ ] Different currencies are not summed together.
- [ ] Edge cases tested: zero amounts rejected, same-account transfer rejected, period boundaries
      (first/last day of month, time zones), empty data, division by zero.
- [ ] Editing or deleting a transaction updates every derived figure (balances, budgets, goals, reports).
