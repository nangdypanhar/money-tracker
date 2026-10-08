import { Info } from "lucide-react";
import { formatMoney, type Minor } from "@/lib/money/money";
import type { CurrencyCode } from "@/lib/money/currency";
import { cn } from "@/lib/utils";
import { paletteColor } from "./category-icon";

/** Navy card with 1px border and faint top highlight. */
export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("surface rounded-3xl border p-4", className)} {...props} />;
}

/** "ⓘ Your monthly spending limit is $10,000" */
export function InfoRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Info className="size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Pill with colored dot + label + amount. */
export function CategoryChip({
  color,
  label,
  amount,
  currency,
}: {
  color: number;
  label: string;
  amount: Minor;
  currency: CurrencyCode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/40 px-2.5 py-1 text-xs">
      <span className="size-1.5 rounded-full" style={{ background: paletteColor(color) }} />
      <span className="text-foreground/90">{label}</span>
      <span className="font-medium tabular-nums">{formatMoney(amount, currency, { compact: amount >= 1_000_000 })}</span>
    </span>
  );
}

/** Rounded segments with small gaps, colored by category. */
export function StackedBar({ segments, className }: { segments: { value: number; color: number }[]; className?: string }) {
  const visible = segments.filter((s) => s.value > 0);
  if (visible.length === 0) {
    return <div className={cn("h-3 rounded-full bg-muted", className)} />;
  }
  return (
    <div className={cn("flex h-3 gap-1", className)} role="img" aria-label="Category share">
      {visible.map((s, i) => (
        <span
          key={i}
          className="min-w-2 rounded-full"
          style={{ flexGrow: s.value, flexBasis: 0, background: paletteColor(s.color) }}
        />
      ))}
    </div>
  );
}

/** "+4.7% Than last month"; green when the change is good, red when bad. */
export function Delta({
  value,
  goodWhen,
  suffix = "than last month",
}: {
  value: number | null;
  goodWhen: "up" | "down";
  suffix?: string;
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-xs text-muted-foreground">No data last month</span>;
  }
  const rounded = Math.round(value * 10) / 10;
  const good = goodWhen === "up" ? rounded >= 0 : rounded <= 0;
  return (
    <span className="text-xs text-muted-foreground">
      <span className={good ? "text-income" : "text-expense"}>
        {rounded > 0 ? "+" : ""}
        {rounded.toFixed(1)}%
      </span>{" "}
      {suffix}
    </span>
  );
}

/** Small stat card: icon + label, value, footer. */
export function StatTile({
  icon,
  label,
  value,
  footer,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface flex min-w-0 flex-col gap-3 rounded-2xl border p-3", className)}>
      <p className="flex items-center gap-1.5 text-xs text-foreground/90 [&_svg]:size-4">
        {icon}
        {label}
      </p>
      <p className="truncate text-base font-medium tabular-nums">{value}</p>
      {footer}
    </div>
  );
}

/** Pill buttons ("Expenses / Budget / Income"); the active one is filled. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-full border px-4 text-sm transition-colors",
            o.value === value
              ? "border-ring/60 bg-primary text-primary-foreground shadow-[0_0_18px_-6px_var(--primary)]"
              : "bg-card/40 hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-medium">{children}</h2>
      {action}
    </div>
  );
}
