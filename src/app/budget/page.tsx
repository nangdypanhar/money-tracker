"use client";

import { ChartColumn, ChartNoAxesCombined, Settings2 } from "lucide-react";
import Link from "next/link";
import { ScreenHeader } from "@/components/app/screen-header";
import { CategoryChip, EmptyState, InfoRow, Panel, SectionTitle } from "@/components/finance/primitives";
import { SpendingGauge } from "@/components/finance/spending-gauge";
import { TransactionList } from "@/components/finance/transaction-list";
import { useData } from "@/features/data/data-provider";
import { useMonthSummary } from "@/features/data/use-month-summary";
import { useTransactionSheet } from "@/features/transactions/transaction-sheet";
import { inRange, monthKey, monthLabel } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/money/money";

/** Sample screen 1: "Monthly budget". */
export default function BudgetPage() {
  const { data, month, categoryById } = useData();
  const { openTransaction } = useTransactionSheet();
  const summary = useMonthSummary(month);
  const { currency, monthlyLimit } = data.settings;

  const segments = summary.expenseByCategory.map((c) => ({
    value: c.total,
    color: categoryById.get(c.categoryId)?.color ?? 0,
  }));
  const monthTransactions = data.transactions.filter((t) => inRange(t.date, summary.range)).slice(0, 30);
  const isCurrentMonth = month === monthKey(new Date());
  const over = monthlyLimit !== null && summary.expenses > monthlyLimit;

  return (
    <main className="flex flex-col gap-5">
      <ScreenHeader
        title="Monthly budget"
        action={
          <Link href="/budget/limits" aria-label="Budget limits" className="grid size-11 place-items-center rounded-full border bg-card/60 hover:bg-accent">
            <Settings2 className="size-4" />
          </Link>
        }
      />

      <div className="px-4">
        <Panel className="flex flex-col gap-4 pt-6">
          <SpendingGauge segments={segments} total={summary.expenses} limit={monthlyLimit} currency={currency} />

          {summary.expenseByCategory.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {summary.expenseByCategory.map((c) => {
                const category = categoryById.get(c.categoryId);
                return (
                  <CategoryChip key={c.categoryId} color={category?.color ?? 0} label={category?.name ?? "Other"} amount={c.total} currency={currency} />
                );
              })}
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">No spending in {monthLabel(month)} yet.</p>
          )}

          <InfoRow className="justify-center">
            {monthlyLimit !== null ? (
              <>
                Your monthly spending limit is {formatMoney(monthlyLimit, currency)}
                {" · "}
                <span className={over ? "text-expense" : "text-income"}>
                  {over
                    ? `${formatMoney(summary.expenses - monthlyLimit, currency)} over`
                    : `${formatMoney(monthlyLimit - summary.expenses, currency)} left`}
                </span>
              </>
            ) : (
              <Link href="/budget/limits" className="underline underline-offset-2">
                Set a monthly spending limit
              </Link>
            )}
          </InfoRow>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4">
        <Link href="/budget/breakdown" className="flex h-11 items-center justify-center gap-2 rounded-full border bg-card/60 text-sm hover:bg-accent">
          <ChartColumn className="size-4" /> Breakdown
        </Link>
        <Link href="/budget/report" className="flex h-11 items-center justify-center gap-2 rounded-full border bg-card/60 text-sm hover:bg-accent">
          <ChartNoAxesCombined className="size-4" /> Report
        </Link>
      </div>

      <section className="flex flex-col gap-2 px-4">
        <SectionTitle>{isCurrentMonth ? "This month" : monthLabel(month)}</SectionTitle>
        {monthTransactions.length > 0 ? (
          <TransactionList transactions={monthTransactions} onSelect={(t) => openTransaction({ edit: t })} />
        ) : (
          <EmptyState title="Nothing recorded this month" />
        )}
      </section>
    </main>
  );
}
