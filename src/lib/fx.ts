/**
 * FX conversion helpers.  The live rate fetcher (`fetchExchangeRates`) lives
 * in `@/lib/fx-rates` (server-only) because it depends on yahoo-finance2,
 * which requires Node built-ins that cannot be bundled for the client.
 */

/** Convert an amount from any currency to SGD using the provided rates map. */
export function toSgd(
  amount: number,
  fromCurrency: string | null | undefined,
  rates: Map<string, number>,
): number {
  if (!fromCurrency || fromCurrency === "SGD" || !rates.has(fromCurrency)) {
    return amount;
  }
  const rate = rates.get(fromCurrency)!;
  return amount * rate;
}

/** Format an amount with its currency symbol. */
export function formatWithCurrency(
  amount: number,
  currency: string,
): string {
  const symbols: Record<string, string> = {
    SGD: "S$",
    USD: "US$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    HKD: "HK$",
    AUD: "A$",
    CNY: "¥",
  };
  const sym = symbols[currency] ?? currency + " ";
  return `${sym}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
