"use client";

import { Segmented } from "@/components/finance/primitives";
import { useData } from "@/features/data/data-provider";
import { CURRENCIES, type CurrencyCode } from "@/lib/money/currency";
import { cn } from "@/lib/utils";

/**
 * "$ Dollar / ៛ Riel" tab for the chart screens, to save space (Home stacks both instead).
 * Shown only when accounts exist in 2+ currencies; the choice is shared across chart screens.
 */
export function ChartCurrencyTabs({ className }: { className?: string }) {
  const { currencies, chartCurrency, setChartCurrency } = useData();
  if (currencies.length < 2) return null;
  return (
    <Segmented
      className={cn("justify-center", className)}
      value={chartCurrency}
      onChange={(next: CurrencyCode) => setChartCurrency(next)}
      options={currencies.map((code) => ({ value: code, label: `${CURRENCIES[code].symbol} ${CURRENCIES[code].short}` }))}
    />
  );
}
