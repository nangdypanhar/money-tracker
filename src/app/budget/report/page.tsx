"use client";

import { Download } from "lucide-react";
import { useMemo } from "react";
import { MonthSelector } from "@/components/app/month-selector";
import { ChartCurrencyTabs } from "@/components/app/chart-currency-tabs";
import { ScreenHeader } from "@/components/app/screen-header";
import { LineChart } from "@/components/finance/line-chart";
import { CategoryChip, InfoRow, Panel, StackedBar } from "@/components/finance/primitives";
import { useData } from "@/features/data/data-provider";
import { useMonthSummary } from "@/features/data/use-month-summary";
import { downloadFile } from "@/lib/backup/backup";
import { exportMonthCsv } from "@/lib/backup/csv";
import {
  filterByCurrency,
  inPeriod,
  isExpense,
  isIncome,
  savingsRate,
  spendingOf,
  totalIncome,
  transferTotals,
} from "@/lib/finance/calculations";
import { addMonths, daysInRange, formatDate, monthKey, monthRange, toLocalDate } from "@/lib/finance/dates";
import type { CurrencyCode } from "@/lib/money/currency";
import { formatMoney, sumMinor } from "@/lib/money/money";

const AVERAGE_MONTHS = 6;

/** Sample screen 3: "Report" — income + cash flow for the currency picked in the $/៛ tab. */
export default function ReportPage() {
  const { data, month, setMonth, categoryById, accountById, chartCurrency } = useData();

  function download() {
    // CSV includes every currency; each row has its own Currency column.
    const csv = exportMonthCsv(inPeriod(data.transactions, monthRange(month)), { accountById, categoryById });
    downloadFile(csv, `moneytrack-${month}.csv`, "text/csv");
  }

  return (
    <main className="flex flex-col gap-5">
      <ScreenHeader
        title="Report"
        back
        action={
          <button
            type="button"
            onClick={download}
            className="flex h-10 items-center gap-1.5 rounded-full border bg-card/60 px-3.5 text-xs hover:bg-accent"
          >
            Download <Download className="size-3.5" />
          </button>
        }
      />
      <div className="flex flex-col gap-3 px-4">
        <ChartCurrencyTabs />
        <MonthSelector value={month} onChange={setMonth} />
      </div>

      <div className="flex flex-col gap-4 px-4">
        <CurrencyReport currency={chartCurrency} />
      </div>
    </main>
  );
}

function CurrencyReport({ currency }: { currency: CurrencyCode }) {
  const { data, month, categoryById } = useData();
  const summary = useMonthSummary(month, currency);

  const report = useMemo(() => {
    const transactions = filterByCurrency(data.transactions, data.accounts, currency);

    // Average monthly income over the last N months ending at the selected month.
    const months = Array.from({ length: AVERAGE_MONTHS }, (_, i) => addMonths(month, -i));
    const incomes = months.map((m) => totalIncome(transactions, monthRange(m)));
    const withData = incomes.filter((v) => v > 0);
    const avgIncome = withData.length ? Math.round(sumMinor(withData) / withData.length) : 0;

    // Cumulative income vs. spending per day (up to today for the current month).
    const today = toLocalDate(new Date());
    const days = daysInRange(summary.range).filter((d) => month !== monthKey(new Date()) || d <= today);
    const inMonth = inPeriod(transactions, summary.range);
    let runningIn = 0;
    let runningOut = 0;
    const cumulativeIn: number[] = [];
    const cumulativeOut: number[] = [];
    for (const day of days) {
      for (const t of inMonth) {
        if (t.date !== day) continue;
        if (isIncome(t)) runningIn += t.amount;
        if (isExpense(t)) runningOut += spendingOf(t);
      }
      cumulativeIn.push(runningIn);
      cumulativeOut.push(Math.max(0, runningOut));
    }

    // Transfers touching this currency's accounts (incl. exchanges) — movement, not income/spending.
    const ids = new Set(data.accounts.filter((a) => a.currency === currency).map((a) => a.id));
    const moved = transferTotals(transactions, summary.range, ids);

    return { avgIncome, days, cumulativeIn, cumulativeOut, moved };
  }, [data.transactions, data.accounts, currency, month, summary.range]);

  const rate = savingsRate(summary.income, summary.expenses);
  const xLabels = report.days.map((d) => formatDate(d, { weekday: false, year: false }));

  return (
    <>
      <Panel className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-foreground/90">Income</p>
          <p className="text-[1.65rem] leading-tight font-semibold tabular-nums">{formatMoney(summary.income, currency)}</p>
        </div>
        <StackedBar
          segments={summary.incomeByCategory.map((c) => ({ value: c.total, color: categoryById.get(c.categoryId)?.color ?? 0 }))}
        />
        {summary.incomeByCategory.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summary.incomeByCategory.map((c) => {
              const category = categoryById.get(c.categoryId);
              return <CategoryChip key={c.categoryId} color={category?.color ?? 0} label={category?.name ?? "Other"} amount={c.total} currency={currency} />;
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <MiniTile label="Total income" value={formatMoney(summary.income, currency)} />
          <MiniTile label="Avg income/mo" value={formatMoney(report.avgIncome, currency)} />
        </div>
      </Panel>

      <Panel className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-foreground/90">Cash flow</p>
          <p className={`text-[1.65rem] leading-tight font-semibold tabular-nums ${summary.netCashFlow < 0 ? "text-expense" : ""}`}>
            {formatMoney(summary.netCashFlow, currency, { signed: true })}
          </p>
          <p className="text-xs text-muted-foreground">Savings rate {rate === null ? "—" : `${Math.round(rate * 100)}%`}</p>
        </div>
        {report.days.length > 1 ? (
          <LineChart
            currency={currency}
            xLabels={xLabels}
            series={[
              { label: "Income", color: "var(--income)", values: report.cumulativeIn },
              { label: "Spending", color: "var(--chart-1)", values: report.cumulativeOut },
            ]}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Not enough days in this month yet for a chart.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <MiniTile dot="var(--income)" label="Total in" value={formatMoney(summary.income, currency)} />
          <MiniTile dot="var(--chart-1)" label="Total out" value={formatMoney(summary.expenses, currency)} />
        </div>
        <InfoRow>
          Transfers & exchanges: {formatMoney(report.moved.totalOut, currency)} out · {formatMoney(report.moved.totalIn, currency)} in —
          not counted as income or spending.
        </InfoRow>
      </Panel>
    </>
  );
}

function MiniTile({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border bg-background/40 px-2 py-3 text-center">
      <span className="flex items-center gap-1.5 text-xs text-foreground/90">
        {dot && <span className="size-2 rounded-full" style={{ background: dot }} />}
        {label}
      </span>
      <span className="text-lg font-medium tabular-nums">{value}</span>
    </div>
  );
}
