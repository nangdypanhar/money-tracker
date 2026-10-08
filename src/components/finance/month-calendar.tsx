import type { DayTotals } from "@/lib/finance/calculations";
import { daysInRange, monthRange, parseLocalDate, toLocalDate, type MonthKey } from "@/lib/finance/dates";
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
  totals: Map<string, DayTotals>;
  currency: CurrencyCode;
  selected: string | null;
  onSelect: (date: string | null) => void;
}

/**
 * Month grid (weeks start Monday). Each day shows its spending; a green dot marks income.
 * The cell tint scales with spending relative to the month's biggest day.
 */
export function MonthCalendar({ month, totals, currency, selected, onSelect }: MonthCalendarProps) {
  const days = daysInRange(monthRange(month));
  const leading = (parseLocalDate(days[0]).getDay() + 6) % 7; // Monday = 0
  const today = toLocalDate(new Date());
  const maxSpend = Math.max(0, ...[...totals.values()].map((d) => d.expenses));

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
          const day = totals.get(date);
          const spent = day?.expenses ?? 0;
          const isSelected = date === selected;
          const isFuture = date > today;
          // 0–28% tint so heavy days stand out without overpowering the text.
          const tint = !isSelected && spent > 0 && maxSpend > 0 ? Math.round(6 + (spent / maxSpend) * 22) : 0;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(isSelected ? null : date)}
              aria-pressed={isSelected}
              aria-label={`${parseLocalDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${
                spent > 0 ? `, spent ${formatMoney(spent, currency)}` : ""
              }${day?.income ? `, income ${formatMoney(day.income, currency)}` : ""}`}
              className={cn(
                "relative flex aspect-square min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-sm transition-colors",
                isSelected ? "bg-primary text-primary-foreground shadow-[0_0_18px_-6px_var(--primary)]" : "hover:bg-accent",
                !isSelected && date === today && "ring-1 ring-ring",
                isFuture && !isSelected && "text-muted-foreground/60",
              )}
              style={tint ? { background: `color-mix(in oklab, var(--expense) ${tint}%, transparent)` } : undefined}
            >
              <span className="leading-none font-medium tabular-nums">{Number(date.slice(-2))}</span>
              <span
                className={cn(
                  "h-3 text-[9px] leading-3 tabular-nums",
                  isSelected ? "text-primary-foreground/90" : "text-muted-foreground",
                )}
              >
                {spent > 0 ? shortAmount(spent, currency) : ""}
              </span>
              {day && day.income > 0 && (
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
