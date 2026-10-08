/**
 * Invariant checks for money logic (see .claude/skills/financial-rules). No test framework needed:
 *   pnpm check:finance
 */
import assert from "node:assert/strict";
import { accountBalance, budgetStatus, dailyTotals, goalBalance, totalExpenses, totalIncome, totalsByCategory, transferTotals, savingsRate } from "@/lib/finance/calculations";
import { parseAmount, formatMoney, toInputString, percentChange } from "@/lib/money/money";
import { monthRange, addMonths, daysInRange } from "@/lib/finance/dates";
import { validateBackup } from "@/lib/backup/backup";
import type { GoalEntry, Transaction } from "@/lib/finance/types";

const base = (id: string) => ({ id, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
const bank = { ...base("bank"), name: "Bank", kind: "bank" as const, currency: "USD" as const, openingBalance: 100_00, archived: false };
const cash = { ...base("cash"), name: "Cash", kind: "cash" as const, currency: "USD" as const, openingBalance: 0, archived: false };
const tx: Transaction[] = [
  { ...base("i1"), type: "income" as const, date: "2026-10-01", accountId: "bank", categoryId: "salary", amount: 1000_00 },
  { ...base("e1"), type: "expense", date: "2026-10-02", accountId: "bank", categoryId: "food", amount: 30_00 },
  { ...base("e2"), type: "expense", date: "2026-10-03", accountId: "bank", categoryId: "food", amount: 5_00, isRefund: true },
  { ...base("t1"), type: "transfer", date: "2026-10-04", fromAccountId: "bank", toAccountId: "cash", fromAmount: 200_00, toAmount: 200_00 },
  { ...base("f1"), type: "expense", date: "2026-10-04", accountId: "bank", categoryId: "fees", amount: 2_00, transferId: "t1" },
  { ...base("a1"), type: "adjustment", date: "2026-10-05", accountId: "cash", delta: -10_00 },
  { ...base("d1"), type: "expense", date: "2026-10-06", accountId: "bank", categoryId: "food", amount: 999_00, deletedAt: "2026-10-07T00:00:00Z" },
  { ...base("old"), type: "expense", date: "2026-09-30", accountId: "bank", categoryId: "food", amount: 50_00 },
];
const goal = { ...base("g"), name: "G", currency: "USD" as const, targetAmount: 500_00, archived: false };
const entries: GoalEntry[] = [
  { ...base("c1"), goalId: "g", accountId: "bank", kind: "contribution", amount: 100_00, date: "2026-10-05" },
  { ...base("w1"), goalId: "g", accountId: "cash", kind: "withdrawal", amount: 40_00, date: "2026-10-06" },
];
const oct = monthRange("2026-10");

// Income/expense exclude transfers, adjustments, goal entries, deleted; refunds reduce spending.
assert.equal(totalIncome(tx, oct), 1000_00);
assert.equal(totalExpenses(tx, oct), 30_00 - 5_00 + 2_00);
assert.deepEqual(totalsByCategory(tx, oct, "expense"), [{ categoryId: "food", total: 25_00 }, { categoryId: "fees", total: 2_00 }]);
// Balances: bank 100 + 1000 - 30 + 5 - 200 - 2 - 50(sep) - 100(goal) = 723 ; cash 200 - 10 + 40 = 230
assert.equal(accountBalance(bank, tx, entries), 723_00);
assert.equal(accountBalance(cash, tx, entries), 230_00);
assert.equal(accountBalance(bank, tx, entries, { asOf: "2026-09-30" }), 50_00);
assert.equal(goalBalance(goal, entries), 60_00);
// Money is conserved: total of balances + goals = opening + income - expenses(all time) + adjustments
const allTime = { start: "0000-01-01", end: "9999-12-31" };
assert.equal(accountBalance(bank, tx, entries) + accountBalance(cash, tx, entries) + goalBalance(goal, entries),
  100_00 + totalIncome(tx, allTime) - totalExpenses(tx, allTime) - 10_00);
const budget = { ...base("b"), name: "", categoryIds: ["food"], currency: "USD" as const, limit: 20_00, period: "monthly" as const };
assert.deepEqual(budgetStatus(budget, tx, oct), { limit: 20_00, spent: 25_00, remaining: -5_00, ratio: 1.25 });
assert.deepEqual(transferTotals(tx, oct, new Set(["bank", "cash"])), { totalIn: 200_00, totalOut: 200_00 });
assert.equal(savingsRate(0, 10), null);
// Daily totals: the transfer day only counts its fee; deleted and adjustment-only days are absent.
const days = dailyTotals(tx, oct);
assert.deepEqual(days.get("2026-10-04"), { income: 0, expenses: 2_00 });
assert.deepEqual(days.get("2026-10-03"), { income: 0, expenses: -5_00 });
assert.equal(days.has("2026-10-05"), false);
assert.equal(days.has("2026-10-06"), false);
assert.equal([...days.values()].reduce((a, d) => a + d.expenses, 0), totalExpenses(tx, oct));

// Money parsing/formatting without float errors.
assert.equal(parseAmount("0.1", "USD")! + parseAmount("0.2", "USD")!, 30);
assert.equal(parseAmount("1,234.56", "USD"), 123456);
assert.equal(parseAmount("1.234", "USD"), null);
assert.equal(parseAmount("abc", "USD"), null);
assert.equal(parseAmount("", "USD"), null);
assert.equal(parseAmount("007", "USD"), 700);
assert.equal(toInputString(-5, "USD"), "-0.05");
assert.equal(formatMoney(-123456, "USD"), "-$1,234.56");
assert.equal(formatMoney(1050, "USD", { signed: true }), "+$10.50");
assert.equal(percentChange(10, 0), null);

// Dates: month boundaries incl. leap year.
assert.deepEqual(monthRange("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
assert.equal(addMonths("2026-01", -1), "2025-12");
assert.equal(daysInRange(monthRange("2026-10")).length, 31);

// Backup validation rejects bad references and newer versions.
const good = { app: "moneytrack", schemaVersion: 1, data: { accounts: [bank, cash], categories: [{ ...base("food"), name: "Food", kind: "expense", color: 0, icon: "x" }, { ...base("fees"), name: "Fees", kind: "expense", color: 0, icon: "x" }, { ...base("salary"), name: "S", kind: "income", color: 0, icon: "x" }], transactions: tx, budgets: [budget], goals: [goal], goalEntries: entries, settings: {} } };
assert.equal(validateBackup(good).ok, true);
assert.equal(validateBackup({ ...good, schemaVersion: 99 }).ok, false);
assert.equal(validateBackup({ ...good, data: { ...good.data, accounts: [bank] } }).ok, false);
assert.equal(validateBackup({ ...good, data: { ...good.data, transactions: [{ ...tx[0], amount: 1.5 }] } }).ok, false);
assert.equal(validateBackup({ app: "other" }).ok, false);
console.log("All finance checks passed");
