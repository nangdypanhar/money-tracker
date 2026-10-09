import type { DayTotals } from "@/lib/finance/calculations";
import { daysInRange, formatDate, monthRange, parseLocalDate, toLocalDate, type MonthKey } from "@/lib/finance/dates";
import { type CurrencyCode, minorDigits } from "@/lib/money/currency";
import { formatMoney, type Minor } from "@/lib/money/money";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Display-only: whole units in compact form ("$111", "$2K") so the cell stays readable. */
function shortAmount(amount: Minor, currency: CurrencyCode): string {
  const unit = 10 ** minorDigits(currency);
  return formatMoney(Math.round(amount / unit) * unit, currency, { compact: true });
}

interface MonthCalendarProps {
  month: MonthKey;
  /** One entry per currency (dollar first, riel second). Amounts are shown per currency, never summed. */
  rows: { currency: CurrencyCode; totals: Map<string, DayTotals> }[];
  selected: string | null;
  onSelect: (date: string | null) => void;
}

/**
 * Month grid (weeks start Monday). Each day shows its spending; a green dot marks income.
 * The cell tint scales with spending relative to the month's biggest day.
 */
export function MonthCalendar({ month, rows, selected, onSelect }: MonthCalendarProps) {
  const days = daysInRange(monthRange(month));
  const leading = (parseLocalDate(days[0]).getDay() + 6) % 7; // Monday = 0
  const today = toLocalDate(new Date());
  // Each currency is scaled by its own biggest day, so ៛ and $ can share one tint without being mixed.
  const maxSpend = rows.map((r) => Math.max(0, ...[...r.totals.values()].map((d) => d.expenses)));

  return (
    <div className="surface rounded-3xl border p-3">
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }, (_, i) => (
          <span key={`pad-${i}`} aria-hidden />
        ))}
        {days.map((date) => {
          const lines = rows
            .map((r) => ({ currency: r.currency, spent: r.totals.get(date)?.expenses ?? 0 }))
            .filter((l) => l.spent > 0);
          const hasIncome = rows.some((r) => (r.totals.get(date)?.income ?? 0) > 0);
          const ratio = Math.max(0, ...rows.map((r, i) => (maxSpend[i] > 0 ? (r.totals.get(date)?.expenses ?? 0) / maxSpend[i] : 0)));
          const isSelected = date === selected;
          const isFuture = date > today;
          // 0–28% tint so heavy days stand out without overpowering the text.
          const tint = !isSelected && ratio > 0 ? Math.round(6 + ratio * 22) : 0;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(isSelected ? null : date)}
              aria-pressed={isSelected}
              aria-label={[
                formatDate(date, { weekday: "long" }),
                ...lines.map((l) => `spent ${formatMoney(l.spent, l.currency)}`),
                hasIncome ? "has income" : "",
              ]
                .filter(Boolean)
                .join(", ")}
              className={cn(
                "relative flex aspect-square min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-sm transition-colors",
                isSelected ? "bg-primary text-primary-foreground shadow-[0_0_18px_-6px_var(--primary)]" : "hover:bg-accent",
                !isSelected && date === today && "ring-1 ring-ring",
                isFuture && !isSelected && "text-muted-foreground/60",
              )}
              style={tint ? { background: `color-mix(in oklab, var(--expense) ${tint}%, transparent)` } : undefined}
            >
              <span className="leading-none font-medium tabular-nums">{Number(date.slice(-2))}</span>
              {/* One line per currency that had spending (e.g. "$45" over "៛20K"); empty days keep the height. */}
              <span
                className={cn(
                  "flex min-h-3 flex-col items-center text-[9px] leading-[10px] tabular-nums",
                  isSelected ? "text-primary-foreground/90" : "text-muted-foreground",
                )}
              >
                {lines.map((l) => (
                  <span key={l.currency}>{shortAmount(l.spent, l.currency)}</span>
                ))}
              </span>
              {hasIncome && (
                <span
                  className={cn("absolute top-1 right-1 size-1.5 rounded-full", isSelected ? "bg-primary-foreground" : "bg-income")}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
