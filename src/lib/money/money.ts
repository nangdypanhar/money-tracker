import { type CurrencyCode, minorDigits } from "./currency";

/** An amount in integer minor units (e.g. cents). Never a float. */
export type Minor = number;

export function assertMinor(value: number): asserts value is Minor {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Invalid money amount: ${value} (must be a safe integer in minor units)`);
  }
}

export function sumMinor(values: Iterable<Minor>): Minor {
  let total = 0;
  for (const v of values) total += v;
  assertMinor(total);
  return total;
}

/**
 * Parse user input ("1,234.5", "12") into integer minor units without float math.
 * Returns null for empty/invalid input or too many decimals.
 */
export function parseAmount(input: string, currency: CurrencyCode): Minor | null {
  const digits = minorDigits(currency);
  const cleaned = input.replace(/[\s,]/g, "");
  if (cleaned === "") return null;

  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;

  const [, whole, fraction = ""] = match;
  if (fraction.length > digits) return null;

  const minorStr = whole + fraction.padEnd(digits, "0");
  const value = Number(minorStr.replace(/^0+(?=\d)/, ""));
  return Number.isSafeInteger(value) ? value : null;
}

/** Convert minor units to a plain decimal string for inputs ("1234.50"). */
export function toInputString(amount: Minor, currency: CurrencyCode): string {
  const digits = minorDigits(currency);
  if (digits === 0) return String(amount);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount).toString().padStart(digits + 1, "0");
  return `${sign}${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: CurrencyCode, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let f = formatters.get(key);
  if (!f) {
    const digits = minorDigits(currency);
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: compact ? 0 : digits,
      maximumFractionDigits: compact ? 1 : digits,
      notation: compact ? "compact" : "standard",
    });
    formatters.set(key, f);
  }
  return f;
}

export interface FormatOptions {
  /** Prefix "+" for positive values (used for signed transaction amounts). */
  signed?: boolean;
  /** Compact notation ($25K) for chart axes. */
  compact?: boolean;
}

/** Display-only formatting. The integer is divided once here and never stored back. */
export function formatMoney(
  amount: Minor,
  currency: CurrencyCode,
  { signed = false, compact = false }: FormatOptions = {},
): string {
  const value = amount / 10 ** minorDigits(currency);
  const text = formatter(currency, compact).format(Math.abs(value));
  if (amount < 0) return `-${text}`;
  if (signed && amount > 0) return `+${text}`;
  return text;
}

/** Percentage change for "+4.7% than last month". Null when there's no baseline. */
export function percentChange(current: Minor, previous: Minor): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Live formatting for amount inputs: keeps only digits and one decimal point, limits decimals to the
 * currency's digits, and groups thousands with commas as the user types ("150000" → "150,000").
 * Display only — `parseAmount` ignores the commas.
 */
export function formatAmountInput(raw: string, currency: CurrencyCode): string {
  const digits = minorDigits(currency);
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = digits > 0 ? cleaned.indexOf(".") : -1;
  let whole = dot === -1 ? cleaned.replace(/\./g, "") : cleaned.slice(0, dot);
  const fraction = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, digits);

  whole = whole.replace(/^0+(?=\d)/, "");
  if (whole === "" && fraction !== null) whole = "0";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === null ? grouped : `${grouped}.${fraction}`;
}
