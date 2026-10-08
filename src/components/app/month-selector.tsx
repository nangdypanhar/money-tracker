"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useData } from "@/features/data/data-provider";
import { monthKey, monthLabel, type MonthKey } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";

interface MonthSelectorProps {
  value: MonthKey;
  onChange: (month: MonthKey) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Jan–Dec pills for one year; the selected month is filled (sample: "Jul  [August]  Sep").
 * A small year switch appears only when there's data from another year.
 */
export function MonthSelector({ value, onChange }: MonthSelectorProps) {
  const { data } = useData();
  const selectedRef = useRef<HTMLButtonElement>(null);
  const current = monthKey(new Date());
  const currentYear = Number(current.slice(0, 4));
  const year = Number(value.slice(0, 4));
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);

  // Earliest year with any record, so older data stays reachable.
  const firstYear = useMemo(() => {
    const years = [...data.transactions, ...data.goalEntries].map((r) => Number(r.date.slice(0, 4)));
    return Math.min(currentYear, ...years);
  }, [data.transactions, data.goalEntries, currentYear]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [value]);

  const changeYear = (next: number) => {
    // Keep the same month; in the current year don't jump past this month.
    const month = Number(value.slice(5, 7));
    const target = `${next}-${pad(month)}`;
    onChange(next === currentYear && target > current ? current : target);
  };

  const showYearSwitch = firstYear < currentYear || year !== currentYear;

  return (
    <div className="flex flex-col gap-2">
      {showYearSwitch && (
        <div className="flex items-center justify-center gap-1 text-sm">
          <button
            type="button"
            aria-label="Previous year"
            disabled={year <= firstYear}
            onClick={() => changeYear(year - 1)}
            className="grid size-9 place-items-center rounded-full hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-12 text-center font-medium tabular-nums">{year}</span>
          <button
            type="button"
            aria-label="Next year"
            disabled={year >= currentYear}
            onClick={() => changeYear(year + 1)}
            className="grid size-9 place-items-center rounded-full hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
      <div className="scrollbar-none -mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-1 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        {/* Spacers let January/December scroll to the center */}
        <span className="w-[30%] shrink-0" aria-hidden />
        {months.map((m) => {
          const selected = m === value;
          const future = m > current;
          return (
            <button
              key={m}
              ref={selected ? selectedRef : undefined}
              type="button"
              onClick={() => onChange(m)}
              aria-pressed={selected}
              aria-label={`${monthLabel(m)} ${year}`}
              className={cn(
                "h-10 shrink-0 snap-center rounded-full border px-6 text-sm transition-colors",
                selected
                  ? "border-ring/60 bg-primary text-primary-foreground shadow-[0_0_20px_-4px_var(--primary)]"
                  : "bg-card/40 text-foreground/90 hover:bg-accent",
                future && !selected && "text-muted-foreground/70",
              )}
            >
              {monthLabel(m, selected ? "long" : "short")}
            </button>
          );
        })}
        <span className="w-[30%] shrink-0" aria-hidden />
      </div>
    </div>
  );
}
