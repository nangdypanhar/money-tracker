"use client";

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { ACCOUNT_ICONS, GOAL_ICON } from "@/components/finance/category-icon";
import { Delta, EmptyState, Panel, SectionTitle, StackedBar, StatTile } from "@/components/finance/primitives";
import { TransactionList } from "@/components/finance/transaction-list";
import { Button } from "@/components/ui/button";
import { useData } from "@/features/data/data-provider";
import { useMonthSummary } from "@/features/data/use-month-summary";
import { useTransactionSheet } from "@/features/transactions/transaction-sheet";
import { accountBalance, goalBalance } from "@/lib/finance/calculations";
import { switchDataMode } from "@/lib/db/mode";
import { monthKey } from "@/lib/finance/dates";
import { formatMoney, percentChange, sumMinor } from "@/lib/money/money";

export default function HomePage() {
  const { data, categoryById } = useData();
  const { openTransaction } = useTransactionSheet();
  const summary = useMonthSummary(monthKey(new Date()));
  const { currency } = data.settings;

  const accounts = useMemo(
    () =>
      data.accounts
        .filter((a) => !a.archived && a.currency === currency)
        .map((a) => ({ account: a, balance: accountBalance(a, data.transactions, data.goalEntries) })),
    [data.accounts, data.transactions, data.goalEntries, currency],
  );
  const available = sumMinor(accounts.map((a) => a.balance));
  const saved = sumMinor(data.goals.filter((g) => g.currency === currency).map((g) => goalBalance(g, data.goalEntries)));

  const recent = data.transactions.slice(0, 8);
  const limit = data.settings.monthlyLimit;

  return (
    <main className="flex flex-col gap-5 px-4">
      <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <div>
          <p className="text-xs text-muted-foreground">Welcome back</p>
          <h1 className="text-xl font-medium">MoneyTrack</h1>
        </div>
        <button
          type="button"
          aria-label="Add transaction"
          onClick={() => openTransaction()}
          className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]"
        >
          <Plus className="size-5" />
        </button>
      </header>

      <Panel className="flex flex-col gap-4 p-5">
        <div>
          <p className="text-sm text-foreground/90">Total balance</p>
          <p className="text-3xl font-semibold tabular-nums">{formatMoney(available, currency)}</p>
          {saved > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <GOAL_ICON className="size-3.5" /> {formatMoney(saved, currency)} set aside in savings goals
            </p>
          )}
        </div>
        <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5">
          {accounts.map(({ account, balance }) => {
            const Icon = ACCOUNT_ICONS[account.kind];
            return (
              <Link key={account.id} href="/accounts" className="flex min-w-32 shrink-0 flex-col gap-2 rounded-2xl border bg-background/40 p-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="size-3.5" /> {account.name}
                </span>
                <span className={balance < 0 ? "text-sm font-medium text-expense tabular-nums" : "text-sm font-medium tabular-nums"}>
                  {formatMoney(balance, currency)}
                </span>
              </Link>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-3">
        <QuickAction label="Expense" onClick={() => openTransaction({ type: "expense" })} className="text-expense">
          <ArrowUpRight />
        </QuickAction>
        <QuickAction label="Income" onClick={() => openTransaction({ type: "income" })} className="text-income">
          <ArrowDownLeft />
        </QuickAction>
        <QuickAction label="Transfer" onClick={() => openTransaction({ type: "transfer" })} className="text-ring">
          <ArrowLeftRight />
        </QuickAction>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Income this month"
          value={<span className="text-income">{formatMoney(summary.income, currency)}</span>}
          footer={<Delta value={percentChange(summary.income, summary.previousIncome)} goodWhen="up" />}
        />
        <StatTile
          label="Spent this month"
          value={<span className="text-expense">{formatMoney(summary.expenses, currency)}</span>}
          footer={<Delta value={percentChange(summary.expenses, summary.previousExpenses)} goodWhen="down" />}
        />
      </div>

      <Link href="/budget" className="block">
        <Panel className="flex flex-col gap-3">
          <SectionTitle action={<ChevronRight className="size-4 text-muted-foreground" />}>Monthly budget</SectionTitle>
          <StackedBar
            segments={summary.expenseByCategory.map((c) => ({ value: c.total, color: categoryById.get(c.categoryId)?.color ?? 0 }))}
          />
          <p className="text-xs text-muted-foreground">
            {limit
              ? `${formatMoney(summary.expenses, currency)} of ${formatMoney(limit, currency)} spent · ${formatMoney(limit - summary.expenses, currency)} left`
              : `${formatMoney(summary.expenses, currency)} spent · tap to set a monthly limit`}
          </p>
        </Panel>
      </Link>

      <section className="flex flex-col gap-2">
        <SectionTitle
          action={
            recent.length > 0 && (
              <Link href="/transactions" className="text-xs text-muted-foreground hover:text-foreground">
                See all
              </Link>
            )
          }
        >
          Recent activity
        </SectionTitle>
        {recent.length > 0 ? (
          <TransactionList transactions={recent} onSelect={(t) => openTransaction({ edit: t })} />
        ) : (
          <EmptyState title="No transactions yet">
            <p>Add your first income or expense, or explore the demo — it uses separate sample data.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button className="rounded-full" onClick={() => openTransaction()}>
                Add transaction
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => switchDataMode("demo")}>
                Try demo
              </Button>
            </div>
          </EmptyState>
        )}
      </section>
    </main>
  );
}

function QuickAction({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface flex flex-col items-center gap-2 rounded-2xl border py-3 text-xs transition-colors hover:bg-accent"
    >
      <span className={`grid size-9 place-items-center rounded-full border bg-background/50 [&_svg]:size-4 ${className ?? ""}`}>{children}</span>
      {label}
    </button>
  );
}
