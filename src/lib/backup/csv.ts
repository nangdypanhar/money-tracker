import type { Account, Category, Transaction } from "@/lib/finance/types";
import { toInputString } from "@/lib/money/money";

const escape = (value: string) => {
  // Stop spreadsheet apps from treating user text as a formula (amounts like "-12.50" stay numeric).
  const safe = /^[=+@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * One row per transaction. "Amount" is signed from the account's point of view;
 * the Type column keeps transfers/adjustments distinguishable from income and expenses.
 */
export function exportMonthCsv(
  transactions: readonly Transaction[],
  lookup: { accountById: Map<string, Account>; categoryById: Map<string, Category> },
): string {
  const header = ["Date", "Time", "Type", "Account", "To account", "Category", "Amount", "Currency", "Note"];
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
    .map((t) => {
      const name = (id: string) => lookup.accountById.get(id)?.name ?? "";
      const currencyOf = (id: string) => lookup.accountById.get(id)?.currency ?? "USD";
      switch (t.type) {
        case "income":
        case "expense": {
          const signed = t.type === "income" || t.isRefund ? t.amount : -t.amount;
          return [t.date, t.time ?? "", t.type === "expense" && t.isRefund ? "refund" : t.type, name(t.accountId), "",
            lookup.categoryById.get(t.categoryId)?.name ?? "", toInputString(signed, currencyOf(t.accountId)), currencyOf(t.accountId), t.note ?? ""];
        }
        case "transfer":
          return [t.date, t.time ?? "", "transfer", name(t.fromAccountId), name(t.toAccountId), "",
            toInputString(t.fromAmount, currencyOf(t.fromAccountId)), currencyOf(t.fromAccountId), t.note ?? ""];
        case "adjustment":
          return [t.date, t.time ?? "", "adjustment", name(t.accountId), "", "",
            toInputString(t.delta, currencyOf(t.accountId)), currencyOf(t.accountId), t.note ?? ""];
      }
    });
  return [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}
