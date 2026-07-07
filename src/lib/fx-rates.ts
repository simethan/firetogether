import "server-only";

/**
 * FX rate utility for converting account balances to SGD.
 *
 * Uses yahoo-finance2 to fetch live FX rates.  Yahoo symbols follow the
 * pattern "USDSGD=X" (fromCurrency + toCurrency + "=X").
 *
 * This module is server-only: yahoo-finance2 depends on Node built-ins
 * (e.g. node:module) that cannot be bundled for the client.
 *
 * The cache lives on `globalThis` so it survives Next.js dev hot-reloads
 * (module re-evaluation) and is shared across requests within a single
 * server instance. Each call returns a *fresh* Map so callers can never
 * mutate the cached reference.
 */
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

type FxCache = { rates: Map<string, number>; time: number };

const globalForFx = globalThis as unknown as { __fxCache?: FxCache };

function readCache(): FxCache | null {
  const cache = globalForFx.__fxCache;
  if (!cache) return null;
  if (Date.now() - cache.time >= CACHE_TTL_MS) return null;
  return cache;
}

function writeCache(rates: Map<string, number>) {
  globalForFx.__fxCache = { rates, time: Date.now() };
}

/**
 * Fetch exchange rates for a set of currencies relative to SGD.
 *
 * @param currencies – ISO currency codes (e.g. "USD", "EUR").  "SGD" is
 *                      always skipped because it's identity.
 * @returns Map where key = currency code, value = 1 currency → SGD.
 *          Currencies whose rate could not be fetched are simply absent
 *          from the map (callers should surface a "rates unavailable" state).
 */
export async function fetchExchangeRates(
  currencies: string[],
): Promise<Map<string, number>> {
  const needed = [...new Set(currencies)]
    .filter((c) => c !== "SGD")
    .filter(Boolean);

  if (needed.length === 0) return new Map();

  const cache = readCache();
  if (cache) {
    const missing = needed.filter((c) => !cache.rates.has(c));
    if (missing.length === 0) {
      // Return a fresh copy so callers can't mutate the cached reference.
      return new Map(cache.rates);
    }
  }

  const { default: YahooFinance } = await import("yahoo-finance2");
  const yf = new YahooFinance();
  const fresh = new Map<string, number>();

  await Promise.allSettled(
    needed.map(async (code) => {
      const symbol = `${code}SGD=X`;
      const quote = await yf.quote(symbol);
      const price = (quote as { regularMarketPrice?: number })
        .regularMarketPrice;
      if (price != null && price > 0) {
        fresh.set(code, price);
      }
    }),
  );

  // Merge with any previously cached rates we didn't just refresh.
  const merged = cache ? new Map(cache.rates) : new Map<string, number>();
  for (const [k, v] of fresh) merged.set(k, v);

  // Only write through if we actually fetched something new; otherwise keep
  // the existing (still warm) cache.
  if (fresh.size > 0) writeCache(merged);

  return new Map(merged);
}
