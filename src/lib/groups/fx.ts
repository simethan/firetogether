import "server-only";

import { fetchExchangeRates } from "@/lib/fx-rates";

/**
 * Live rates into `base` for the given currencies: 1 unit of currency = rate
 * units of base. Frankfurter (ECB, what SmartSplit uses) first, then Yahoo for
 * currencies ECB doesn't publish (e.g. TWD, VND).
 */
export async function fetchRatesToBase(
  base: string,
  currencies: string[],
): Promise<Record<string, number>> {
  const wanted = [...new Set(currencies)].filter((c) => c && c !== base);
  const result: Record<string, number> = {};
  if (wanted.length === 0) return result;

  try {
    const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}&symbols=${wanted
      .map(encodeURIComponent)
      .join(",")}`;
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      const body = (await response.json()) as { rates?: Record<string, number> };
      for (const [currency, perBase] of Object.entries(body.rates ?? {})) {
        if (perBase > 0) result[currency] = 1 / perBase;
      }
    }
  } catch {
    // Fall through to Yahoo for everything that's missing.
  }

  const missing = wanted.filter((c) => result[c] == null);
  if (missing.length > 0) {
    const toSgd = await fetchExchangeRates([...missing, base]);
    const baseToSgd = base === "SGD" ? 1 : toSgd.get(base);
    if (baseToSgd) {
      for (const currency of missing) {
        const rate = currency === "SGD" ? 1 : toSgd.get(currency);
        if (rate) result[currency] = rate / baseToSgd;
      }
    }
  }

  return result;
}

/** Convert an amount into SGD, FireTogether's budget currency. */
export async function convertToSgd(amount: number, currency: string): Promise<number | null> {
  if (currency === "SGD") return amount;
  const rates = await fetchExchangeRates([currency]);
  const rate = rates.get(currency);
  return rate ? amount * rate : null;
}
