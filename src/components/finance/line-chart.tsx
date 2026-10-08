import { formatMoney, type Minor } from "@/lib/money/money";
import { type CurrencyCode, minorDigits } from "@/lib/money/currency";

export interface LineSeries {
  label: string;
  /** CSS color. */
  color: string;
  values: Minor[];
}

interface LineChartProps {
  series: LineSeries[];
  /** One label per point; only a few are shown. */
  xLabels: string[];
  currency: CurrencyCode;
  height?: number;
}

const W = 300;

/** Round the max up to a "nice" number so axis labels read cleanly. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value)!;
  return step * magnitude;
}

/** Thin lines on dark with muted axis labels (sample: Report → Transfer). */
export function LineChart({ series, xLabels, currency, height = 150 }: LineChartProps) {
  // An empty month still gets a readable scale ($0–$100) instead of repeated "$0" labels.
  const minScale = 100 * 10 ** minorDigits(currency);
  const max = niceMax(Math.max(minScale, ...series.flatMap((s) => s.values)));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(max * f));
  const count = Math.max(...series.map((s) => s.values.length), 2);

  const x = (i: number) => (i / (count - 1)) * W;
  const y = (v: number) => height - (v / max) * height;

  const labelIndexes = count > 2 ? [0, Math.floor((count - 1) / 2), count - 1] : [0, count - 1];

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2">
      <div className="relative text-[10px] leading-none text-muted-foreground tabular-nums" style={{ height }}>
        {/* Invisible copy of the widest label sets the column width */}
        <span className="invisible">{formatMoney(max, currency, { compact: true })}</span>
        {ticks.map((t, i) => (
          <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
            {formatMoney(t, currency, { compact: true })}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="w-full overflow-visible"
        style={{ height }}
        role="img"
        aria-label={series.map((s) => s.label).join(" and ")}
      >
        {ticks.map((t, i) => (
          <line key={i} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s) => (
          <polyline
            key={s.label}
            fill="none"
            stroke={s.color}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          />
        ))}
      </svg>
      <span />
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        {labelIndexes.map((i) => (
          <span key={i}>{xLabels[i]}</span>
        ))}
      </div>
    </div>
  );
}
