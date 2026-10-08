"use client";

import { useEffect, useRef } from "react";
import { addMonths, monthKey, monthLabel, type MonthKey } from "@/lib/finance/dates";
import { cn } from "@/lib/utils";

interface MonthSelectorProps {
  value: MonthKey;
  onChange: (month: MonthKey) => void;
  /** How many months back to offer. */
  past?: number;
}

/** Horizontally scrolling month pills; the selected one is filled (sample: "Jul  [August]  Sep"). */
export function MonthSelector({ value, onChange, past = 12 }: MonthSelectorProps) {
  const current = monthKey(new Date());
  const months = Array.from({ length: past + 1 }, (_, i) => addMonths(current, i - past));
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [value]);

  const showYear = (m: MonthKey) => m.slice(0, 4) !== current.slice(0, 4);

  return (
    <div className="scrollbar-none -mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-1 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      {/* Spacers let the first/last month scroll to the center */}
      <span className="w-[30%] shrink-0" aria-hidden />
      {months.map((m) => {
        const selected = m === value;
        return (
          <button
            key={m}
            ref={selected ? selectedRef : undefined}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={selected}
            className={cn(
              "h-10 shrink-0 snap-center rounded-full border px-6 text-sm transition-colors",
              selected
                ? "border-ring/60 bg-primary text-primary-foreground shadow-[0_0_20px_-4px_var(--primary)]"
                : "bg-card/40 text-foreground/90 hover:bg-accent",
            )}
          >
            {monthLabel(m, selected ? "long" : "short")}
            {showYear(m) && <span className="ml-1 text-xs opacity-70">{m.slice(2, 4)}</span>}
          </button>
        );
      })}
      <span className="w-[30%] shrink-0" aria-hidden />
    </div>
  );
}
