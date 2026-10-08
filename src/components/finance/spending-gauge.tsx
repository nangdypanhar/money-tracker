import { formatMoney, type Minor } from "@/lib/money/money";
import type { CurrencyCode } from "@/lib/money/currency";
import { paletteColor } from "./category-icon";

interface GaugeSegment {
  value: Minor;
  color: number;
}

interface SpendingGaugeProps {
  segments: GaugeSegment[];
  total: Minor;
  /** Monthly limit; when null the gauge is scaled to the total itself. */
  limit: Minor | null;
  currency: CurrencyCode;
  label?: string;
}

const TICKS = 26;
const CX = 150;
const CY = 140;
const R_OUTER = 128;
const R_INNER = 96;

/**
 * Semicircle of rounded ticks (sample: "Monthly budget"). Filled ticks are colored by category share of
 * spending; the rest stay dim. Over the limit, every tick is filled.
 */
export function SpendingGauge({ segments, total, limit, currency, label = "Total spend" }: SpendingGaugeProps) {
  const scale = limit && limit > 0 ? limit : total;
  const filled = scale > 0 ? Math.min(TICKS, Math.round((Math.min(total, scale) / scale) * TICKS)) : 0;

  // Cumulative boundaries of each category, as a fraction of `total`.
  const positive = segments.filter((s) => s.value > 0);
  const sum = positive.reduce((acc, s) => acc + s.value, 0);
  const boundaries: { end: number; color: number }[] = [];
  let acc = 0;
  for (const s of positive) {
    acc += s.value;
    boundaries.push({ end: acc / sum, color: s.color });
  }

  const tickColor = (i: number): string | null => {
    if (i >= filled || boundaries.length === 0) return null;
    const position = (i + 0.5) / filled;
    return paletteColor((boundaries.find((b) => position <= b.end) ?? boundaries.at(-1)!).color);
  };

  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <svg viewBox="0 0 300 150" className="w-full" role="img" aria-label={`${label}: ${formatMoney(total, currency)}`}>
        {Array.from({ length: TICKS }, (_, i) => {
          const angle = Math.PI - (i / (TICKS - 1)) * Math.PI;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const color = tickColor(i);
          return (
            <line
              key={i}
              x1={CX + R_INNER * cos}
              y1={CY - R_INNER * sin}
              x2={CX + R_OUTER * cos}
              y2={CY - R_OUTER * sin}
              strokeWidth={11}
              strokeLinecap="round"
              stroke={color ?? "var(--muted-foreground)"}
              // Unfilled ticks fade out toward the end, as in the sample.
              opacity={color ? 1 : Math.max(0.08, 0.3 - (i - filled) * 0.015)}
            />
          );
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
        <span className="text-sm text-foreground/90">{label}</span>
        <span className="text-[1.65rem] leading-tight font-semibold tabular-nums">{formatMoney(total, currency)}</span>
      </div>
    </div>
  );
}
