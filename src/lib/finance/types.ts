import type { CurrencyCode } from "@/lib/money/currency";
import type { Minor } from "@/lib/money/money";

/** Local calendar date, "YYYY-MM-DD". */
export type LocalDate = string;

/** Shared by every persisted record (see the local-data skill). */
export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type AccountKind = "cash" | "bank" | "ewallet" | "credit";

export interface Account extends BaseRecord {
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  /** Property of the account — not an income transaction. */
  openingBalance: Minor;
  archived: boolean;
}

export type CategoryKind = "income" | "expense";

export interface Category extends BaseRecord {
  name: string;
  kind: CategoryKind;
  /** Index into the chart palette (chart-1..6). */
  color: number;
  icon: string;
}

interface TransactionBase extends BaseRecord {
  date: LocalDate;
  /** "HH:mm", optional. */
  time?: string;
  note?: string;
}

export interface IncomeTransaction extends TransactionBase {
  type: "income";
  accountId: string;
  categoryId: string;
  /** Always positive; direction comes from `type`. */
  amount: Minor;
}

export interface ExpenseTransaction extends TransactionBase {
  type: "expense";
  accountId: string;
  categoryId: string;
  amount: Minor;
  /** A refund reduces spending in its category. */
  isRefund?: boolean;
  /** Set when this expense is the fee of a transfer. */
  transferId?: string;
}

export interface TransferTransaction extends TransactionBase {
  type: "transfer";
  fromAccountId: string;
  toAccountId: string;
  fromAmount: Minor;
  /** Equal to fromAmount for same-currency transfers. */
  toAmount: Minor;
}

export interface AdjustmentTransaction extends TransactionBase {
  type: "adjustment";
  accountId: string;
  /** Signed: positive raises the balance, negative lowers it. */
  delta: Minor;
}

export type Transaction =
  | IncomeTransaction
  | ExpenseTransaction
  | TransferTransaction
  | AdjustmentTransaction;

export type TransactionType = Transaction["type"];

export interface Budget extends BaseRecord {
  name: string;
  categoryIds: string[];
  currency: CurrencyCode;
  limit: Minor;
  period: "monthly";
}

export interface Goal extends BaseRecord {
  name: string;
  currency: CurrencyCode;
  targetAmount: Minor;
  targetDate?: LocalDate;
  archived: boolean;
}

/** Money moved between an account and a goal. Never income or expense. */
export interface GoalEntry extends BaseRecord {
  goalId: string;
  accountId: string;
  kind: "contribution" | "withdrawal";
  amount: Minor;
  date: LocalDate;
  note?: string;
}

/** A named group of shopping items ("Groceries", "Birthday party"). */
export interface ShoppingList extends BaseRecord {
  name: string;
  /** Index into the chart palette (chart-1..6). */
  color: number;
}

/** "need" = required item; "want" = nice to have. */
export type ShoppingPriority = "need" | "want";

/**
 * Something the user plans to buy. A plan only: it never changes a balance and is never counted as
 * spending. Buying it is recorded separately as a normal expense.
 */
export interface ShoppingItem extends BaseRecord {
  name: string;
  priority: ShoppingPriority;
  /** The list it belongs to; unset = no list. */
  listId?: string;
  currency: CurrencyCode;
  /** Expected price, optional. */
  estimate?: Minor;
  note?: string;
  /** When to buy it (local date), optional. Used for day / week / month grouping. */
  dueDate?: LocalDate;
  /** ISO timestamp when ticked off; unset while still to buy. */
  boughtAt?: string;
}

export interface DateRange {
  /** Inclusive. */
  start: LocalDate;
  /** Inclusive. */
  end: LocalDate;
}
