"use client";

import { useMemo } from "react";
import {
  filterByCurrency,
  totalExpenses,
  totalIncome,
  totalsByCategory,
} from "@/lib/finance/calculations";
import { addMonths, monthRange, type MonthKey } from "@/lib/finance/dates";
import type { CurrencyCode } from "@/lib/money/currency";
import { useData } from "./data-provider";

/**
 * Month figures for ONE currency (only that currency's accounts). Pages call it per currency and show
 * dollar and riel in separate blocks. Transfers/goal entries/adjustments never enter these totals.
 */
export function useMonthSummary(month: MonthKey, currency: CurrencyCode) {
  const { data } = useData();

  return useMemo(() => {
    const transactions = filterByCurrency(data.transactions, data.accounts, currency);
    const range = monthRange(month);
    const previousRange = monthRange(addMonths(month, -1));

    const income = totalIncome(transactions, range);
    const expenses = totalExpenses(transactions, range);

    return {
      currency,
      range,
      transactions,
      income,
      expenses,
      netCashFlow: income - expenses,
      previousIncome: totalIncome(transactions, previousRange),
      previousExpenses: totalExpenses(transactions, previousRange),
      expenseByCategory: totalsByCategory(transactions, range, "expense"),
      previousExpenseByCategory: totalsByCategory(transactions, previousRange, "expense"),
      incomeByCategory: totalsByCategory(transactions, range, "income"),
    };
  }, [data.transactions, data.accounts, currency, month]);
}
