"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Keyboard, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  addDays,
  addMonths,
  daysInRange,
  formatDate,
  monthKey,
  monthRange,
  parseDateInput,
  parseLocalDate,
  toLocalDate,
} from "@/lib/finance/dates";
import type { LocalDate } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Quick picks: "past" suits records (transactions), "future" suits plans (shopping, goal targets). */
type QuickSet = "past" | "future";

function quickPicks(set: QuickSet, today: LocalDate): { label: string; date: LocalDate }[] {
  return set === "past"
    ? [
        { label: "Today", date: today },
        { label: "Yesterday", date: addDays(today, -1) },
        { label: "2 days ago", date: addDays(today, -2) },
      ]
    : [
        { label: "Today", date: today },
        { label: "Tomorrow", date: addDays(today, 1) },
        { label: "Next week", date: addDays(today, 7) },
        { label: "Next month", date: sameDayNextMonth(today) },
      ];
}

/** Oct 31 → Nov 30: the same day next month, clamped to that month's last day. */
function sameDayNextMonth(today: LocalDate): LocalDate {
  const { end } = monthRange(addMonths(today.slice(0, 7), 1));
  const day = `${end.slice(0, 8)}${today.slice(8)}`;
  return day < end ? day : end;
}

function formatLong(date: LocalDate): string {
  return formatDate(date, { weekday: "long" });
}

/**
 * Date picker: tap to open a calendar, use a quick pick, or type the date ("15/10", "15/10/2026", "2026-10-15").
 * The value is a local date "YYYY-MM-DD", or "" for none (only when `optional`).
 */
export function DateField({
  id,
  value,
  onChange,
  optional,
  quick = "future",
  placeholder = "Pick a date",
}: {
  id?: string;
  value: LocalDate | "";
  onChange: (value: LocalDate | "") => void;
  optional?: boolean;
  quick?: QuickSet;
  placeholder?: string;
}) {
  const today = toLocalDate(new Date());
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);

  function pick(date: LocalDate | "") {
    onChange(date);
    setOpen(false);
    setTyping(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <button
          id={id}
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            setTyping(false);
          }}
          className={cn(
            "flex h-11 w-full items-center gap-2 rounded-xl border bg-transparent px-3 text-left text-sm transition-colors hover:bg-accent/60 dark:bg-input/30",
            open && "border-ring ring-1 ring-ring",
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("flex-1 truncate", optional && value ? "pr-20" : "pr-10", !value && "text-muted-foreground")}>{value ? formatLong(value) : placeholder}</span>
        </button>
        <div className="absolute top-0 right-0 flex">
          {optional && value && (
            <button
              type="button"
              aria-label="Clear date"
              onClick={() => pick("")}
              className="grid size-11 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Type the date"
            aria-pressed={typing}
            onClick={() => {
              setTyping((t) => !t);
              setOpen(false);
            }}
            className={cn(
              "grid size-11 place-items-center rounded-full transition-colors hover:text-foreground",
              typing ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Keyboard className="size-4" />
          </button>
        </div>
      </div>

      <div className="scrollbar-none -mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1">
        {quickPicks(quick, today).map((q) => (
          <button
            key={q.label}
            type="button"
            aria-pressed={value === q.date}
            onClick={() => pick(q.date)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3 text-xs transition-colors",
              value === q.date ? "border-ring/60 bg-primary text-primary-foreground" : "bg-card/40 hover:bg-accent",
            )}
          >
            {q.label}
          </button>
        ))}
      </div>

      {typing && <TypedDate value={value} today={today} onSubmit={pick} />}
      {open && <CalendarGrid value={value} today={today} onPick={pick} />}
    </div>
  );
}

function TypedDate({ value, today, onSubmit }: { value: LocalDate | ""; today: LocalDate; onSubmit: (date: LocalDate) => void }) {
  const [text, setText] = useState(() => (value ? parseLocalDate(value).toLocaleDateString("en-GB") : ""));
  const parsed = text.trim() ? parseDateInput(text, today) : null;
  const apply = () => parsed && onSubmit(parsed);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          autoFocus
          inputMode="numeric"
          aria-label="Type a date"
          placeholder="dd/mm/yyyy"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          className="h-11 flex-1 rounded-xl tabular-nums"
        />
        <button
          type="button"
          disabled={!parsed}
          onClick={apply}
          className="h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground disabled:opacity-40"
        >
          Set
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {text.trim() ? (parsed ? formatLong(parsed) : "Not a valid date — try 15/10 or 15/10/2026.") : "Day first: 15/10 or 15/10/2026."}
      </p>
    </div>
  );
}

/** Month grid (weeks start Monday, like the History calendar). */
function CalendarGrid({ value, today, onPick }: { value: LocalDate | ""; today: LocalDate; onPick: (date: LocalDate) => void }) {
  const [month, setMonth] = useState(() => monthKey(parseLocalDate(value || today)));
  const days = daysInRange(monthRange(month));
  const leading = (parseLocalDate(days[0]).getDay() + 6) % 7;
  const [y, m] = month.split("-").map(Number);
  const title = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="rounded-2xl border bg-background/40 p-2">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))} className="grid size-11 place-items-center rounded-full hover:bg-accent">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium">{title}</span>
        <button type="button" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} className="grid size-11 place-items-center rounded-full hover:bg-accent">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: leading }, (_, i) => (
          <span key={`pad-${i}`} aria-hidden />
        ))}
        {days.map((date) => {
          const selected = date === value;
          return (
            <button
              key={date}
              type="button"
              aria-pressed={selected}
              aria-label={formatLong(date)}
              onClick={() => onPick(date)}
              className={cn(
                "grid h-11 place-items-center rounded-full text-sm tabular-nums transition-colors",
                selected ? "bg-primary text-primary-foreground shadow-[0_0_18px_-6px_var(--primary)]" : "hover:bg-accent",
                !selected && date === today && "ring-1 ring-ring",
              )}
            >
              {Number(date.slice(-2))}
            </button>
          );
        })}
      </div>
      {month !== monthKey(parseLocalDate(today)) && (
        <button type="button" onClick={() => setMonth(monthKey(parseLocalDate(today)))} className="mt-1 h-9 w-full rounded-full text-xs text-muted-foreground hover:bg-accent">
          Back to today
        </button>
      )}
    </div>
  );
}
