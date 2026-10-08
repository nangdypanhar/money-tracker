/**
 * Per-currency minor-unit digits. Amounts are stored as integers in these units.
 * Add a currency here (and confirm its practical decimals) before allowing it in the UI.
 */
export const CURRENCIES = {
  USD: { digits: 2, symbol: "$", name: "US Dollar" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function minorDigits(currency: CurrencyCode): number {
  return CURRENCIES[currency].digits;
}
