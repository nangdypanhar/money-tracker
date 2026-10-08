"use client";

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Equal } from "lucide-react";
import { useData } from "@/features/data/data-provider";
import { parseLocalDate, toLocalDate } from "@/lib/finance/dates";
import type { Transaction } from "@/lib/finance/types";
import { formatMoney } from "@/lib/money/money";
import type { CurrencyCode } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import { ADJUSTMENT_ICON, CategoryIcon, TRANSFER_ICON } from "./category-icon";

interface RowView {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  badge: { className: string; icon: React.ReactNode };
  amount: string;
  amountClass: string;
}

function useRowView(t: Transaction): RowView {
  const { accountById, categoryById } = useData();
  const accountName = (id: string) => accountById.get(id)?.name ?? "Deleted account";
  const currencyOf = (id: string): CurrencyCode => accountById.get(id)?.currency ?? "USD";

  switch (t.type) {
    case "income":
    case "expense": {
      const category = categoryById.get(t.categoryId);
      const isIn = t.type === "income" || t.isRefund;
      return {
        title: t.note || category?.name || "Uncategorized",
        subtitle: [t.note ? category?.name : null, accountName(t.accountId), t.type === "expense" && t.isRefund ? "Refund" : null]
          .filter(Boolean)
          .join(" · "),
        icon: <CategoryIcon name={category?.icon ?? "ellipsis"} className="size-5" />,
        badge: isIn
          ? { className: "bg-income", icon: <ArrowDownLeft /> }
          : { className: "bg-expense", icon: <ArrowUpRight /> },
        amount: formatMoney(isIn ? t.amount : -t.amount, currencyOf(t.accountId), { signed: true }),
        amountClass: isIn ? "text-income" : "text-expense",
      };
    }
    case "transfer":
      // Moving money between own accounts: neutral color, no sign — it's not income or spending.
      return {
        title: t.note || "Transfer",
        subtitle: `${accountName(t.fromAccountId)} → ${accountName(t.toAccountId)}`,
        icon: <TRANSFER_ICON className="size-5" />,
        badge: { className: "bg-primary", icon: <ArrowLeftRight /> },
        amount: formatMoney(t.fromAmount, currencyOf(t.fromAccountId)),
        amountClass: "text-foreground",
      };
    case "adjustment":
      return {
        title: t.note || "Balance adjustment",
        subtitle: accountName(t.accountId),
        icon: <ADJUSTMENT_ICON className="size-5" />,
        badge: { className: "bg-muted-foreground", icon: <Equal /> },
        amount: formatMoney(t.delta, currencyOf(t.accountId), { signed: true }),
        amountClass: "text-muted-foreground",
      };
  }
}

export function TransactionRow({ transaction, onSelect }: { transaction: Transaction; onSelect?: (t: Transaction) => void }) {
  const view = useRowView(transaction);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(transaction)}
        className="flex w-full items-center gap-3 rounded-2xl py-2.5 text-left transition-colors hover:bg-card/60"
      >
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full border bg-card">
          {view.icon}
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full ring-2 ring-background [&_svg]:size-2.5 [&_svg]:text-white",
              view.badge.className,
            )}
          >
            {view.badge.icon}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{view.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{view.subtitle}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("block text-sm font-medium tabular-nums", view.amountClass)}>{view.amount}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">{transaction.time ?? ""}</span>
        </span>
      </button>
    </li>
  );
}

function dayLabel(date: string): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date === toLocalDate(today)) return "Today";
  if (date === toLocalDate(yesterday)) return "Yesterday";
  return parseLocalDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: date.slice(0, 4) === String(today.getFullYear()) ? undefined : "numeric",
  });
}

/** Transactions grouped under "Today", "Yesterday", "Mon, 4 Aug"… (expects newest first). */
export function TransactionList({
  transactions,
  onSelect,
}: {
  transactions: Transaction[];
  onSelect?: (t: Transaction) => void;
}) {
  const groups: { date: string; items: Transaction[] }[] = [];
  for (const t of transactions) {
    const last = groups.at(-1);
    if (last?.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.date}>
          <h3 className="mb-1 text-sm font-medium">{dayLabel(g.date)}</h3>
          <ul className="flex flex-col">
            {g.items.map((t) => (
              <TransactionRow key={t.id} transaction={t} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
