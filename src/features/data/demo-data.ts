/**
 * Sample data for demo mode (its own database — see lib/db/mode.ts), so a user can see the app filled in
 * like docs/sample-ui without touching their real records. Written in one IndexedDB transaction.
 */
import { withTransaction } from "@/lib/db/idb";
import { getDataMode } from "@/lib/db/mode";
import { DEFAULT_CASH_ACCOUNT_ID, FEES_CATEGORY_ID } from "@/lib/db/seed";
import { getMeta } from "@/lib/db/settings";
import { newId } from "@/lib/id";
import { addMonths, monthKey, monthRange, toLocalDate } from "@/lib/finance/dates";
import type { Account, Budget, Goal, GoalEntry, Transaction } from "@/lib/finance/types";
import type { Minor } from "@/lib/money/money";

/** Small deterministic PRNG so demo data looks the same every time. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

let demoSeeding: Promise<void> | null = null;

/** Fill the demo database on first use. Shared promise + meta flag make it safe to call twice. */
export function seedDemoIfNeeded(): Promise<void> {
  if (getDataMode() !== "demo") return Promise.resolve();
  demoSeeding ??= (async () => {
    if (await getMeta<boolean>("demoSeeded")) return;
    await writeDemoData(DEFAULT_CASH_ACCOUNT_ID);
  })().catch((error) => {
    demoSeeding = null;
    throw error;
  });
  return demoSeeding;
}

async function writeDemoData(cashAccountId: string | undefined): Promise<void> {
  const rand = random(42);
  const now = new Date();
  const stamp = now.toISOString();
  const today = toLocalDate(now);
  const base = () => ({ id: newId(), createdAt: stamp, updatedAt: stamp });
  const cents = (dollars: number): Minor => Math.round(dollars * 100);
  const between = (min: number, max: number) => cents(min + rand() * (max - min));
  const time = () => `${String(8 + Math.floor(rand() * 13)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`;

  const bank: Account = { ...base(), name: "Bank", kind: "bank", currency: "USD", openingBalance: cents(4200), archived: false };
  const wallet: Account = { ...base(), name: "E-wallet", kind: "ewallet", currency: "USD", openingBalance: cents(150), archived: false };
  const cash = cashAccountId ?? newId();
  const extraCash: Account | null = cashAccountId
    ? null
    : { id: cash, createdAt: stamp, updatedAt: stamp, name: "Cash", kind: "cash", currency: "USD", openingBalance: 0, archived: false };

  const goal: Goal = { ...base(), name: "Emergency fund", currency: "USD", targetAmount: cents(5000), archived: false };

  const transactions: Transaction[] = [];
  const goalEntries: GoalEntry[] = [];
  const expense = (date: string, categoryId: string, amount: Minor, accountId: string, note?: string) =>
    transactions.push({ ...base(), type: "expense", date, time: time(), accountId, categoryId, amount, note });
  const income = (date: string, categoryId: string, amount: Minor, note?: string) =>
    transactions.push({ ...base(), type: "income", date, time: time(), accountId: bank.id, categoryId, amount, note });

  for (let back = 3; back >= 0; back--) {
    const month = addMonths(monthKey(now), -back);
    const { end } = monthRange(month);
    const day = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
    const last = Number(end.slice(-2));

    income(day(1), "default-income-salary", cents(7000), "Monthly salary");
    income(day(15), "default-income-investments", between(600, 1200), "Dividends");
    income(day(20), "default-income-business", between(400, 700), "Freelance project");
    if (back === 1) income(day(25), "default-income-bonus", cents(550), "Quarterly bonus");

    expense(day(2), "default-expense-housing", cents(2000), bank.id, "Rent");
    expense(day(5), "default-expense-utilities", between(180, 260), bank.id, "Electricity & water");
    expense(day(6), "default-expense-bills", cents(35), wallet.id, "Internet bills");

    for (let d = 1; d <= last; d++) {
      if (rand() < 0.45) expense(day(d), "default-expense-foods", between(4, 28), cash, "Lunch");
      if (rand() < 0.18) expense(day(d), "default-expense-groceries", between(25, 90), wallet.id, "Groceries");
      if (rand() < 0.25) expense(day(d), "default-expense-transport", between(3, 22), wallet.id, "Ride");
      if (rand() < 0.05) expense(day(d), "default-expense-health", between(20, 120), bank.id, "Pharmacy");
      if (rand() < 0.06) expense(day(d), "default-expense-entertainment", between(10, 45), wallet.id, "Movies");
    }

    // ATM withdrawals: bank → cash transfer plus a separate fee expense.
    for (const d of [3, 12, 21]) {
      const transfer: Transaction = {
        ...base(), type: "transfer", date: day(d), time: time(), fromAccountId: bank.id, toAccountId: cash,
        fromAmount: cents(200), toAmount: cents(200), note: "Withdraw from ATM",
      };
      transactions.push(transfer);
      expense(day(d), FEES_CATEGORY_ID, cents(2), bank.id, "Transfer fee");
      (transactions.at(-1) as Transaction & { transferId?: string }).transferId = transfer.id;
    }
    transactions.push({
      ...base(), type: "transfer", date: day(8), time: time(), fromAccountId: bank.id, toAccountId: wallet.id,
      fromAmount: cents(400), toAmount: cents(400), note: "Top up e-wallet",
    });

    goalEntries.push({ ...base(), goalId: goal.id, accountId: bank.id, kind: "contribution", amount: cents(300), date: day(2) });
  }

  const limits: [string, number][] = [
    ["default-expense-housing", 2000],
    ["default-expense-groceries", 450],
    ["default-expense-foods", 600],
    ["default-expense-health", 300],
    ["default-expense-transport", 500],
    ["default-expense-utilities", 250],
  ];
  const budgets: Budget[] = limits.map(([categoryId, limit]) => ({
    ...base(), name: "", categoryIds: [categoryId], currency: "USD", limit: cents(limit), period: "monthly",
  }));

  await withTransaction(["accounts", "transactions", "goals", "goalEntries", "budgets", "settings", "meta"], "readwrite", (tx) => {
    tx.objectStore("meta").put({ key: "demoSeeded", value: true });
    const accounts = tx.objectStore("accounts");
    accounts.put(bank);
    accounts.put(wallet);
    if (extraCash) accounts.put(extraCash);
    // Nothing in the future.
    for (const t of transactions) if (t.date <= today) tx.objectStore("transactions").put(t);
    tx.objectStore("goals").put(goal);
    for (const e of goalEntries) if (e.date <= today) tx.objectStore("goalEntries").put(e);
    for (const b of budgets) tx.objectStore("budgets").put(b);
    tx.objectStore("settings").put({ key: "app", value: { currency: "USD", monthlyLimit: cents(5000) }, updatedAt: stamp });
  });
}
