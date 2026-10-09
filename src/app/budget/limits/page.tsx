"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChartCurrencyTabs } from "@/components/app/chart-currency-tabs";
import { AmountInput } from "@/components/app/form";
import { ScreenHeader } from "@/components/app/screen-header";
import { CategoryIcon, paletteColor } from "@/components/finance/category-icon";
import { InfoRow, Panel, SectionTitle } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { useData } from "@/features/data/data-provider";
import { budgetsRepo } from "@/lib/db/repositories";
import { monthlyLimitFor, setSetting } from "@/lib/db/settings";
import type { Budget } from "@/lib/finance/types";
import type { CurrencyCode } from "@/lib/money/currency";
import { formatMoney, parseAmount, sumMinor, toInputString } from "@/lib/money/money";

type Inputs = Record<string, string>; // categoryId → amount text

/**
 * Monthly + per-category limits. A $/៛ tab shows one currency at a time to save space; edits in both tabs are
 * kept and one Save writes them all.
 */
export default function BudgetLimitsPage() {
  const { data, refresh, currencies, chartCurrency } = useData();
  const expenseCategories = data.categories.filter((c) => c.kind === "expense");
  const budgetFor = (currency: CurrencyCode, categoryId: string): Budget | undefined =>
    data.budgets.find((b) => b.currency === currency && b.categoryIds.length === 1 && b.categoryIds[0] === categoryId);

  const [monthly, setMonthly] = useState<Partial<Record<CurrencyCode, string>>>(() =>
    Object.fromEntries(
      currencies.map((code) => {
        const limit = monthlyLimitFor(data.settings, code);
        return [code, limit !== null ? toInputString(limit, code) : ""];
      }),
    ),
  );
  const [limits, setLimits] = useState<Partial<Record<CurrencyCode, Inputs>>>(() =>
    Object.fromEntries(
      currencies.map((code) => [
        code,
        Object.fromEntries(
          expenseCategories.map((c) => {
            const b = budgetFor(code, c.id);
            return [c.id, b ? toInputString(b.limit, code) : ""];
          }),
        ),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);

  const parse = (text: string | undefined, code: CurrencyCode) => (text?.trim() ? parseAmount(text, code) : null);

  async function save() {
    for (const code of currencies) {
      const m = monthly[code] ?? "";
      if (m.trim() && !((parse(m, code) ?? 0) > 0)) return toast.error("A monthly limit isn't a valid amount.");
      for (const text of Object.values(limits[code] ?? {})) {
        if (text.trim() && !((parse(text, code) ?? 0) > 0)) return toast.error("One of the category limits isn't a valid amount.");
      }
    }

    setSaving(true);
    try {
      const monthlyLimits = { ...data.settings.monthlyLimits };
      for (const code of currencies) {
        const value = parse(monthly[code], code);
        if (value) monthlyLimits[code] = value;
        else delete monthlyLimits[code];
      }
      await setSetting("app", { ...data.settings, monthlyLimits });

      for (const code of currencies) {
        for (const [categoryId, text] of Object.entries(limits[code] ?? {})) {
          const value = parse(text, code);
          const existing = budgetFor(code, categoryId);
          if (value && existing) {
            if (existing.limit !== value) await budgetsRepo.update({ ...existing, limit: value });
          } else if (value) {
            await budgetsRepo.create({ name: "", categoryIds: [categoryId], currency: code, limit: value, period: "monthly" });
          } else if (existing) {
            await budgetsRepo.softDelete(existing.id);
          }
        }
      }
      await refresh();
      toast.success("Budget saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex flex-col gap-5 px-4">
      <ScreenHeader title="Budget limits" back className="px-0" />
      <ChartCurrencyTabs />

      {currencies
        .filter((code) => code === chartCurrency)
        .map((code) => {
        const categoryInputs = limits[code] ?? {};
        const categorySum = sumMinor(Object.values(categoryInputs).map((t) => parse(t, code) ?? 0));
        const monthlyValue = parse(monthly[code], code);
        return (
          <section key={code} className="flex flex-col gap-3">
            <Panel className="flex flex-col gap-3">
              <SectionTitle>Monthly spending limit</SectionTitle>
              <AmountInput
                large
                value={monthly[code] ?? ""}
                onChange={(v) => setMonthly((m) => ({ ...m, [code]: v }))}
                currency={code}
                aria-label={`Monthly spending limit (${code})`}
                placeholder="No limit"
              />
              <InfoRow>Covers all expenses from these accounts. Transfers and savings don&apos;t count toward it.</InfoRow>
            </Panel>

            <Panel className="flex flex-col gap-3">
              <SectionTitle>Per category</SectionTitle>
              <ul className="flex flex-col gap-2">
                {expenseCategories.map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full"
                      style={{ background: `color-mix(in oklab, ${paletteColor(c.color)} 22%, transparent)`, color: paletteColor(c.color) }}
                    >
                      <CategoryIcon name={c.icon} className="size-4" />
                    </span>
                    <span className="flex-1 truncate text-sm">{c.name}</span>
                    <AmountInput
                      value={categoryInputs[c.id] ?? ""}
                      onChange={(v) => setLimits((l) => ({ ...l, [code]: { ...(l[code] ?? {}), [c.id]: v } }))}
                      currency={code}
                      placeholder="—"
                      aria-label={`${c.name} limit (${code})`}
                      className="w-32"
                    />
                  </li>
                ))}
              </ul>
              {categorySum > 0 && (
                <InfoRow>
                  Category limits add up to {formatMoney(categorySum, code)}
                  {monthlyValue && categorySum > monthlyValue ? " — more than your monthly limit." : "."}
                </InfoRow>
              )}
            </Panel>
          </section>
        );
      })}

      <Button onClick={save} disabled={saving} className="h-12 rounded-full text-base">
        Save budget
      </Button>
    </main>
  );
}
