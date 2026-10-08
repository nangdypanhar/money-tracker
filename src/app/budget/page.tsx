"use client";

import { ChartColumn, ChartNoAxesCombined, Settings2 } from "lucide-react";
import Link from "next/link";
import { ChartCurrencyTabs } from "@/components/app/chart-currency-tabs";
import { ScreenHeader } from "@/components/app/screen-header";
import { CategoryChip, EmptyState, InfoRow, Panel, SectionTitle } from "@/components/finance/primitives";
import { SpendingGauge } from "@/components/finance/spending-gauge";
import { TransactionList } from "@/components/finance/transaction-list";
import { useData } from "@/features/data/data-provider";
import { useMonthSummary } from "@/features/data/use-month-summary";
import { useTransactionSheet } from "@/features/transactions/transaction-sheet";
import { monthlyLimitFor } from "@/lib/db/settings";
import { inRange, monthKey, monthLabel, monthRange } from "@/lib/finance/dates";
import type { CurrencyCode } from "@/lib/money/currency";
import { formatMoney } from "@/lib/money/money";

/** Sample screen 1: "Monthly budget" — one gauge for the currency picked in the $/៛ tab. */
export default function BudgetPage() {
  const { data, month, chartCurrency } = useData();
  const { openTransaction } = useTransactionSheet();
  const range = monthRange(month);
  const monthTransactions = data.transactions.filter((t) => inRange(t.date, range)).slice(0, 30);
  const isCurrentMonth = month === monthKey(new Date());

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

      <div className="flex flex-col gap-4 px-4">
        <ChartCurrencyTabs />
        <GaugeCard currency={chartCurrency} />
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

function GaugeCard({ currency }: { currency: CurrencyCode }) {
  const { data, month, categoryById } = useData();
  const summary = useMonthSummary(month, currency);
  const monthlyLimit = monthlyLimitFor(data.settings, currency);
  const segments = summary.expenseByCategory.map((c) => ({
    value: c.total,
    color: categoryById.get(c.categoryId)?.color ?? 0,
  }));
  const over = monthlyLimit !== null && summary.expenses > monthlyLimit;

  return (
    <Panel className="flex flex-col gap-4 pt-5">
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
  );
}
