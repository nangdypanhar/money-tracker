"use client";

import { ShoppingBag, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MonthSelector } from "@/components/app/month-selector";
import { ChartCurrencyTabs } from "@/components/app/chart-currency-tabs";
import { ScreenHeader } from "@/components/app/screen-header";
import { paletteColor } from "@/components/finance/category-icon";
import {
  CategoryChip,
  Delta,
  EmptyState,
  InfoRow,
  Panel,
  Segmented,
  StackedBar,
  StatTile,
} from "@/components/finance/primitives";
import { useData } from "@/features/data/data-provider";
import { useMonthSummary } from "@/features/data/use-month-summary";
import { monthlyLimitFor } from "@/lib/db/settings";
import { budgetStatus } from "@/lib/finance/calculations";
import type { CategoryTotal } from "@/lib/finance/calculations";
import { formatMoney, percentChange } from "@/lib/money/money";
import { CURRENCIES, type CurrencyCode } from "@/lib/money/currency";
import { cn } from "@/lib/utils";

type View = "expenses" | "budget" | "income";

/** Sample screen 2: "Budgeting Breakdown" — for the currency picked in the $/៛ tab (never mixed). */
export default function BreakdownPage() {
  const { month, setMonth, chartCurrency } = useData();
  const [view, setView] = useState<View>("expenses");

  return (
    <main className="flex flex-col gap-5">
      <ScreenHeader title="Budgeting Breakdown" back />
      <div className="flex flex-col gap-3 px-4">
        <ChartCurrencyTabs />
        <MonthSelector value={month} onChange={setMonth} />
      </div>

      <div className="px-4">
        <SpendingSummary currency={chartCurrency} />
      </div>

      <section className="flex flex-col gap-3 px-4">
        <h2 className="text-sm font-medium">Category Breakdown</h2>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "expenses", label: "Expenses" },
            { value: "budget", label: "Budget" },
            { value: "income", label: "Income" },
          ]}
        />
        <CategoryBreakdown currency={chartCurrency} view={view} />
      </section>
    </main>
  );
}

function SpendingSummary({ currency }: { currency: CurrencyCode }) {
  const { month, categoryById } = useData();
  const summary = useMonthSummary(month, currency);
  const top = summary.expenseByCategory[0];
  const topPrevious = top ? summary.previousExpenseByCategory.find((c) => c.categoryId === top.categoryId)?.total ?? 0 : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon={<WalletCards />}
          label="Total spent"
          value={formatMoney(summary.expenses, currency)}
          footer={<Delta value={percentChange(summary.expenses, summary.previousExpenses)} goodWhen="down" />}
        />
        <StatTile
          icon={<ShoppingBag />}
          label="Top spending"
          value={top ? (categoryById.get(top.categoryId)?.name ?? "Other") : "—"}
          footer={top ? <Delta value={percentChange(top.total, topPrevious)} goodWhen="down" /> : <span className="text-xs text-muted-foreground">No spending yet</span>}
        />
      </div>
      <InfoRow>
        Net cash flow{" "}
        <span className={summary.netCashFlow < 0 ? "text-expense" : "text-foreground"}>
          {formatMoney(summary.netCashFlow, currency, { signed: true })}
        </span>
      </InfoRow>
    </div>
  );
}

function CategoryBreakdown({ currency, view }: { currency: CurrencyCode; view: View }) {
  const { data, month, categoryById } = useData();
  const summary = useMonthSummary(month, currency);
  const monthlyLimit = monthlyLimitFor(data.settings, currency);

  const budgets = useMemo(
    () =>
      data.budgets
        .filter((b) => b.currency === currency)
        .map((b) => ({ budget: b, status: budgetStatus(b, summary.transactions, summary.range) }))
        .sort((a, b) => (b.status.ratio ?? 0) - (a.status.ratio ?? 0)),
    [data.budgets, currency, summary.transactions, summary.range],
  );

  if (view === "expenses") {
    return (
      <CategoryPanel title="Total spend" total={summary.expenses} totals={summary.expenseByCategory} currency={currency}>
        {monthlyLimit !== null ? (
          <InfoRow>Your monthly spending limit is {formatMoney(monthlyLimit, currency)}</InfoRow>
        ) : (
          <InfoRow>
            <Link href="/budget/limits" className="underline underline-offset-2">
              Set a monthly spending limit
            </Link>
          </InfoRow>
        )}
      </CategoryPanel>
    );
  }

  if (view === "income") {
    return (
      <CategoryPanel title="Total income" total={summary.income} totals={summary.incomeByCategory} currency={currency}>
        <InfoRow>Transfers between your accounts and savings aren&apos;t counted as income.</InfoRow>
      </CategoryPanel>
    );
  }

  if (budgets.length === 0) {
    return (
      <EmptyState title={`No ${CURRENCIES[currency].short.toLowerCase()} category budgets yet`}>
        <Link href="/budget/limits" className="underline underline-offset-2">
          Set limits per category
        </Link>
      </EmptyState>
    );
  }

  return (
    <Panel className="flex flex-col gap-4">
      {budgets.map(({ budget, status }) => {
        const category = categoryById.get(budget.categoryIds[0]);
        const over = status.remaining < 0;
        return (
          <div key={budget.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: paletteColor(category?.color ?? 0) }} />
                {budget.name || category?.name || "Budget"}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(status.spent, currency)} / {formatMoney(status.limit, currency)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, (status.ratio ?? 0) * 100))}%`,
                  background: over ? "var(--expense)" : paletteColor(category?.color ?? 0),
                }}
              />
            </div>
            <p className={cn("text-xs", over ? "text-expense" : "text-muted-foreground")}>
              {over ? `${formatMoney(-status.remaining, currency)} over budget` : `${formatMoney(status.remaining, currency)} left`}
            </p>
          </div>
        );
      })}
    </Panel>
  );
}

function CategoryPanel({
  title,
  total,
  totals,
  currency,
  children,
}: {
  title: string;
  total: number;
  totals: CategoryTotal[];
  currency: CurrencyCode;
  children?: React.ReactNode;
}) {
  const { categoryById } = useData();
  return (
    <Panel className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-foreground/90">{title}</p>
        <p className="text-[1.65rem] leading-tight font-semibold tabular-nums">{formatMoney(total, currency)}</p>
      </div>
      <StackedBar segments={totals.map((c) => ({ value: c.total, color: categoryById.get(c.categoryId)?.color ?? 0 }))} />
      {totals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {totals.map((c) => {
            const category = categoryById.get(c.categoryId);
            return <CategoryChip key={c.categoryId} color={category?.color ?? 0} label={category?.name ?? "Other"} amount={c.total} currency={currency} />;
          })}
        </div>
      )}
      {children}
    </Panel>
  );
}
