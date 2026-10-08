"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AmountInput } from "@/components/app/form";
import { ScreenHeader } from "@/components/app/screen-header";
import { CategoryIcon, paletteColor } from "@/components/finance/category-icon";
import { InfoRow, Panel, SectionTitle } from "@/components/finance/primitives";
import { Button } from "@/components/ui/button";
import { useData } from "@/features/data/data-provider";
import { budgetsRepo } from "@/lib/db/repositories";
import { setSetting } from "@/lib/db/settings";
import { formatMoney, parseAmount, sumMinor, toInputString } from "@/lib/money/money";

export default function BudgetLimitsPage() {
  const { data, refresh } = useData();
  const { currency } = data.settings;
  const expenseCategories = data.categories.filter((c) => c.kind === "expense");
  const budgetFor = (categoryId: string) =>
    data.budgets.find((b) => b.currency === currency && b.categoryIds.length === 1 && b.categoryIds[0] === categoryId);

  const [monthly, setMonthly] = useState(data.settings.monthlyLimit !== null ? toInputString(data.settings.monthlyLimit, currency) : "");
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      expenseCategories.map((c) => {
        const b = budgetFor(c.id);
        return [c.id, b ? toInputString(b.limit, currency) : ""];
      }),
    ),
  );
  const [saving, setSaving] = useState(false);

  const parsedLimits = Object.entries(limits).map(([id, v]) => [id, v.trim() ? parseAmount(v, currency) : null] as const);
  const categorySum = sumMinor(parsedLimits.map(([, v]) => v ?? 0));

  async function save() {
    const monthlyValue = monthly.trim() ? parseAmount(monthly, currency) : null;
    if (monthly.trim() && (monthlyValue === null || monthlyValue <= 0)) return toast.error("Monthly limit isn't a valid amount.");
    if (parsedLimits.some(([id, v]) => limits[id].trim() && (v === null || v <= 0))) {
      return toast.error("One of the category limits isn't a valid amount.");
    }

    setSaving(true);
    try {
      await setSetting("app", { ...data.settings, monthlyLimit: monthlyValue });
      for (const [categoryId, value] of parsedLimits) {
        const existing = budgetFor(categoryId);
        if (value && existing) {
          if (existing.limit !== value) await budgetsRepo.update({ ...existing, limit: value });
        } else if (value) {
          await budgetsRepo.create({ name: "", categoryIds: [categoryId], currency, limit: value, period: "monthly" });
        } else if (existing) {
          await budgetsRepo.softDelete(existing.id);
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

      <Panel className="flex flex-col gap-3">
        <SectionTitle>Monthly spending limit</SectionTitle>
        <AmountInput large value={monthly} onChange={setMonthly} currency={currency} aria-label="Monthly spending limit" placeholder="No limit" />
        <InfoRow>Covers all expenses. Transfers and savings don&apos;t count toward it.</InfoRow>
      </Panel>

      <Panel className="flex flex-col gap-3">
        <SectionTitle>Per category</SectionTitle>
        <ul className="flex flex-col gap-2">
          {expenseCategories.map((c) => (
            <li key={c.id} className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${paletteColor(c.color)} 22%, transparent)`, color: paletteColor(c.color) }}>
                <CategoryIcon name={c.icon} className="size-4" />
              </span>
              <span className="flex-1 truncate text-sm">{c.name}</span>
              <AmountInput
                value={limits[c.id] ?? ""}
                onChange={(v) => setLimits((l) => ({ ...l, [c.id]: v }))}
                currency={currency}
                placeholder="—"
                aria-label={`${c.name} limit`}
                className="w-32"
              />
            </li>
          ))}
        </ul>
        {categorySum > 0 && (
          <InfoRow>
            Category limits add up to {formatMoney(categorySum, currency)}
            {(() => {
              const m = monthly.trim() ? parseAmount(monthly, currency) : null;
              return m && categorySum > m ? " — more than your monthly limit." : ".";
            })()}
          </InfoRow>
        )}
      </Panel>

      <Button onClick={save} disabled={saving} className="h-12 rounded-full text-base">
        Save budget
      </Button>
    </main>
  );
}
