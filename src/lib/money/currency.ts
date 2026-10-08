/**
 * Per-currency minor-unit digits. Amounts are stored as integers in these units.
 * Add a currency here (and confirm its practical decimals) before allowing it in the UI.
 */
export const CURRENCIES = {
  USD: { digits: 2, symbol: "$", name: "US Dollar", short: "Dollar" },
  // Added at the user's request. 0 minor digits because riel is used in whole amounts in practice (no coins).
  KHR: { digits: 0, symbol: "៛", name: "Cambodian Riel", short: "Riel" },
} as const;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export type CurrencyCode = keyof typeof CURRENCIES;

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function minorDigits(currency: CurrencyCode): number {
  return CURRENCIES[currency].digits;
}
