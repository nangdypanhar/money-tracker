"use client";

import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { MonthSelector } from "@/components/app/month-selector";
import { ScreenHeader } from "@/components/app/screen-header";
import { MonthCalendar } from "@/components/finance/month-calendar";
import { EmptyState, Segmented } from "@/components/finance/primitives";
import { TransactionList } from "@/components/finance/transaction-list";
import { Input } from "@/components/ui/input";
import { useData } from "@/features/data/data-provider";
import { useTransactionSheet } from "@/features/transactions/transaction-sheet";
import { dailyTotals, filterByCurrency, totalExpenses, totalIncome } from "@/lib/finance/calculations";
import { inRange, monthLabel, monthRange, parseLocalDate } from "@/lib/finance/dates";
import type { Transaction } from "@/lib/finance/types";
import { formatMoney } from "@/lib/money/money";

type Filter = "all" | "expense" | "income" | "transfer";

export default function TransactionsPage() {
  const { data, month, setMonth, categoryById, accountById, currencies } = useData();
  const { openTransaction } = useTransactionSheet();
  const range = useMemo(() => monthRange(month), [month]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState<string | null>(null);

  // Per-currency figures (dollar first, riel below) — never added together.
  const perCurrency = useMemo(
    () =>
      currencies.map((currency) => {
        const txs = filterByCurrency(data.transactions, data.accounts, currency);
        return {
          currency,
          daily: dailyTotals(txs, range),
          income: totalIncome(txs, range),
          expenses: totalExpenses(txs, range),
        };
      }),
    [currencies, data.transactions, data.accounts, range],
  );

  const changeMonth = (next: string) => {
    setMonth(next);
    setDay(null);
  };

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (t: Transaction) => {
      if (!q) return true;
      const text = [
        t.note,
        "categoryId" in t ? categoryById.get(t.categoryId)?.name : "transfer",
        "accountId" in t ? accountById.get(t.accountId)?.name : null,
        t.type === "transfer" ? `${accountById.get(t.fromAccountId)?.name} ${accountById.get(t.toAccountId)?.name}` : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    };
    return data.transactions.filter(
      (t) =>
        (day ? t.date === day : inRange(t.date, range)) && (filter === "all" || t.type === filter) && matches(t),
    );
  }, [data.transactions, range, day, filter, query, categoryById, accountById]);

  const dayLabel = day
    ? parseLocalDate(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : null;

  return (
    <main className="flex flex-col gap-4">
      <ScreenHeader
        title="History"
        action={
          <button
            type="button"
            aria-label={day ? `Add transaction on ${dayLabel}` : "Add transaction"}
            onClick={() => openTransaction(day ? { date: day } : undefined)}
            className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            <Plus className="size-5" />
          </button>
        }
      />
      <div className="px-4">
        <MonthSelector value={month} onChange={changeMonth} />
      </div>

      <div className="px-4">
        <MonthCalendar
          month={month}
          rows={perCurrency.map((c) => ({ currency: c.currency, totals: c.daily }))}
          selected={day}
          onSelect={setDay}
        />
      </div>

      <div className="flex flex-col gap-2 px-4">
        {day && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{dayLabel}</span>
            <button
              type="button"
              onClick={() => setDay(null)}
              className="flex h-8 items-center gap-1 rounded-full border bg-card/60 px-3 text-xs hover:bg-accent"
            >
              <X className="size-3" /> Whole month
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 text-center text-xs">
          <div className="rounded-2xl border bg-card/60 py-2.5">
            <p className="text-muted-foreground">Income</p>
            {perCurrency.map((c) => (
              <p key={c.currency} className="text-sm font-medium text-income tabular-nums">
                {formatMoney(day ? (c.daily.get(day)?.income ?? 0) : c.income, c.currency)}
              </p>
            ))}
          </div>
          <div className="rounded-2xl border bg-card/60 py-2.5">
            <p className="text-muted-foreground">Spent</p>
            {perCurrency.map((c) => (
              <p key={c.currency} className="text-sm font-medium text-expense tabular-nums">
                {formatMoney(day ? (c.daily.get(day)?.expenses ?? 0) : c.expenses, c.currency)}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, categories, accounts"
            className="h-11 rounded-full bg-card/60 pl-9"
          />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "expense", label: "Expenses" },
            { value: "income", label: "Income" },
            { value: "transfer", label: "Transfers" },
          ]}
        />
      </div>

      <div className="px-4">
        {items.length > 0 ? (
          <TransactionList transactions={items} onSelect={(t) => openTransaction({ edit: t })} />
        ) : (
          <EmptyState
            title={
              query || filter !== "all"
                ? "No matching transactions"
                : day
                  ? `Nothing on ${dayLabel}`
                  : `Nothing in ${monthLabel(month)}`
            }
          />
        )}
      </div>
    </main>
  );
}
