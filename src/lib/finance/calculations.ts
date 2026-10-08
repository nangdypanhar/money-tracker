/**
 * Pure money calculations. See .claude/skills/financial-rules/SKILL.md.
 * Rules enforced here:
 *  - income/expense totals only ever include `income` / `expense` records;
 *  - transfers, adjustments, goal entries, and opening balances never count as income or spending;
 *  - soft-deleted records are ignored;
 *  - all sums are integer minor units.
 */
import { type Minor, sumMinor } from "@/lib/money/money";
import { inRange } from "./dates";
import type {
  Account,
  Budget,
  DateRange,
  ExpenseTransaction,
  Goal,
  GoalEntry,
  IncomeTransaction,
  Transaction,
  TransferTransaction,
} from "./types";

const live = <T extends { deletedAt?: string }>(items: readonly T[]): T[] =>
  items.filter((item) => !item.deletedAt);

export const isIncome = (t: Transaction): t is IncomeTransaction => t.type === "income";
export const isExpense = (t: Transaction): t is ExpenseTransaction => t.type === "expense";
export const isTransfer = (t: Transaction): t is TransferTransaction => t.type === "transfer";

/** Signed spending contribution of an expense: refunds reduce spending. */
export const spendingOf = (t: ExpenseTransaction): Minor => (t.isRefund ? -t.amount : t.amount);

/** Signed effect of one transaction on one account's balance. */
export function balanceEffect(t: Transaction, accountId: string): Minor {
  switch (t.type) {
    case "income":
      return t.accountId === accountId ? t.amount : 0;
    case "expense":
      return t.accountId === accountId ? -spendingOf(t) : 0;
    case "transfer": {
      let effect = 0;
      if (t.fromAccountId === accountId) effect -= t.fromAmount;
      if (t.toAccountId === accountId) effect += t.toAmount;
      return effect;
    }
    case "adjustment":
      return t.accountId === accountId ? t.delta : 0;
  }
}

export function goalEntryEffect(entry: GoalEntry, accountId: string): Minor {
  if (entry.accountId !== accountId) return 0;
  return entry.kind === "contribution" ? -entry.amount : entry.amount;
}

export interface BalanceOptions {
  /** Only count records on or before this date (for historical balances). */
  asOf?: string;
}

/** Derived balance — never stored as an editable running total. */
export function accountBalance(
  account: Account,
  transactions: readonly Transaction[],
  goalEntries: readonly GoalEntry[] = [],
  { asOf }: BalanceOptions = {},
): Minor {
  const within = (date: string) => !asOf || date <= asOf;
  return sumMinor([
    account.openingBalance,
    ...live(transactions)
      .filter((t) => within(t.date))
      .map((t) => balanceEffect(t, account.id)),
    ...live(goalEntries)
      .filter((e) => within(e.date))
      .map((e) => goalEntryEffect(e, account.id)),
  ]);
}

export function goalBalance(goal: Goal, entries: readonly GoalEntry[]): Minor {
  return sumMinor(
    live(entries)
      .filter((e) => e.goalId === goal.id)
      .map((e) => (e.kind === "contribution" ? e.amount : -e.amount)),
  );
}

/** 0..1+ (not clamped; clamp in the UI only). Null when the target is 0. */
export function goalProgress(goal: Goal, entries: readonly GoalEntry[]): number | null {
  if (goal.targetAmount <= 0) return null;
  return goalBalance(goal, entries) / goal.targetAmount;
}

/** Restrict to one currency via the accounts the records belong to. */
export function filterByCurrency(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  currency: string,
): Transaction[] {
  const ids = new Set(accounts.filter((a) => a.currency === currency).map((a) => a.id));
  return live(transactions).filter((t) =>
    t.type === "transfer" ? ids.has(t.fromAccountId) || ids.has(t.toAccountId) : ids.has(t.accountId),
  );
}

export function inPeriod(transactions: readonly Transaction[], range: DateRange): Transaction[] {
  return live(transactions).filter((t) => inRange(t.date, range));
}

export function totalIncome(transactions: readonly Transaction[], range: DateRange): Minor {
  return sumMinor(inPeriod(transactions, range).filter(isIncome).map((t) => t.amount));
}

/** Spending net of refunds. Transfers, adjustments and goal entries are excluded by construction. */
export function totalExpenses(transactions: readonly Transaction[], range: DateRange): Minor {
  return sumMinor(inPeriod(transactions, range).filter(isExpense).map(spendingOf));
}

export interface CategoryTotal {
  categoryId: string;
  total: Minor;
}

/** Totals per category, largest first. Categories netting to <= 0 are dropped. */
export function totalsByCategory(
  transactions: readonly Transaction[],
  range: DateRange,
  kind: "income" | "expense",
): CategoryTotal[] {
  const totals = new Map<string, Minor>();
  for (const t of inPeriod(transactions, range)) {
    if (t.type !== kind) continue;
    const value = t.type === "expense" ? spendingOf(t) : t.amount;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + value);
  }
  return [...totals]
    .map(([categoryId, total]) => ({ categoryId, total }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

export interface BudgetStatus {
  limit: Minor;
  spent: Minor;
  /** May be negative (over budget). */
  remaining: Minor;
  /** spent / limit, unclamped; null when limit is 0. */
  ratio: number | null;
}

export function budgetStatus(
  budget: Budget,
  transactions: readonly Transaction[],
  range: DateRange,
): BudgetStatus {
  const categories = new Set(budget.categoryIds);
  const spent = sumMinor(
    inPeriod(transactions, range)
      .filter(isExpense)
      .filter((t) => categories.has(t.categoryId))
      .map(spendingOf),
  );
  return {
    limit: budget.limit,
    spent,
    remaining: budget.limit - spent,
    ratio: budget.limit > 0 ? spent / budget.limit : null,
  };
}

export interface TransferTotals {
  /** Transfers arriving into any of the given accounts. */
  totalIn: Minor;
  /** Transfers leaving any of the given accounts. */
  totalOut: Minor;
}

/**
 * Transfer volume for the report screen. This is movement, not income or spending: a transfer between
 * two accounts in the set shows up in both totals.
 */
export function transferTotals(
  transactions: readonly Transaction[],
  range: DateRange,
  accountIds: ReadonlySet<string>,
): TransferTotals {
  let totalIn = 0;
  let totalOut = 0;
  for (const t of inPeriod(transactions, range).filter(isTransfer)) {
    if (accountIds.has(t.toAccountId)) totalIn += t.toAmount;
    if (accountIds.has(t.fromAccountId)) totalOut += t.fromAmount;
  }
  return { totalIn, totalOut };
}

/** (income − expenses) / income; null when income is 0 (show "—"). */
export function savingsRate(income: Minor, expenses: Minor): number | null {
  return income > 0 ? (income - expenses) / income : null;
}
