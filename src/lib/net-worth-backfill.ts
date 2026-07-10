import type { SupabaseClient } from "@supabase/supabase-js";

import type { NetWorthAccount } from "@/lib/types";

type YahooFinanceClient = InstanceType<typeof import("yahoo-finance2").default>;

/**
 * Fetch one ticker's daily closes for a single [period1, period2] window.
 */
async function fetchTickerWindow(
  yf: YahooFinanceClient,
  ticker: string,
  p1: number,
  p2: number,
): Promise<Map<string, number>> {
  const chart = await yf.chart(ticker, {
    period1: p1,
    period2: p2,
    interval: "1d",
    return: "array",
  });
  const pricesByDate = new Map<string, number>();
  for (const q of chart.quotes) {
    const close = q.close ?? q.adjclose ?? null;
    if (close == null) continue;
    const d =
      q.date instanceof Date
        ? q.date.toISOString().slice(0, 10)
        : new Date(q.date).toISOString().slice(0, 10);
    pricesByDate.set(d, close);
  }
  return pricesByDate;
}

/**
 * Fetch daily closing prices from Yahoo Finance using the `chart()` endpoint
 * directly — the old `historical()` endpoint was removed by Yahoo and its
 * compatibility shim truncated long ranges.
 *
 * Yahoo can return a truncated/partial payload when a single request spans a
 * long period (or rate-limit a request), which previously left history ending
 * mid-range.  We fetch in <=1-year windows and retry each window a few times,
 * merging the results so one call reliably covers the full requested range.
 *
 * Returns ticker -> (date -> close).
 */
export async function fetchHistoricalClosePrices(
  tickers: string[],
  period1Sec: number,
  period2Sec: number,
): Promise<Map<string, Map<string, number>>> {
  const byTicker = new Map<string, Map<string, number>>();
  if (tickers.length === 0) return byTicker;

  const { default: YahooFinance } = await import("yahoo-finance2");
  const yf = new YahooFinance({ suppressNotices: ["ripHistorical"] });

  // Split the full range into <=1-year chunks to avoid Yahoo response caps.
  const CHUNK_SEC = 365 * 24 * 3600;
  const windows: Array<[number, number]> = [];
  for (let cur = period1Sec; cur < period2Sec; cur += CHUNK_SEC) {
    windows.push([cur, Math.min(cur + CHUNK_SEC, period2Sec)]);
  }

  const MAX_ATTEMPTS = 3;

  for (const ticker of tickers) {
    const merged = new Map<string, number>();
    let succeeded = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !succeeded; attempt++) {
      try {
        for (const [c1, c2] of windows) {
          const part = await fetchTickerWindow(yf, ticker, c1, c2);
          for (const [d, c] of part) merged.set(d, c);
        }
        succeeded = true;
      } catch {
        // Transient failure / rate limit — back off and retry.
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }

    if (merged.size > 0) byTicker.set(ticker, merged);
  }

  return byTicker;
}

/**
 * Backfill daily closing-price snapshots for a single stock account, from
 * startStr up to today.  Deletes any existing snapshots in range first so
 * re-runs stay clean.  Throws on DB error (does not redirect).
 */
export async function backfillAccountHistory(
  admin: SupabaseClient,
  accountId: string,
  ticker: string,
  quantity: number,
  startStr: string,
): Promise<void> {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (startStr >= todayStr) return;

  const dayAfterToday = new Date();
  dayAfterToday.setDate(dayAfterToday.getDate() + 1);
  const period1Sec = Math.floor(new Date(startStr).getTime() / 1000);
  const period2Sec = Math.floor(dayAfterToday.getTime() / 1000);

  const byTicker = await fetchHistoricalClosePrices([ticker], period1Sec, period2Sec);
  const prices = byTicker.get(ticker);
  if (!prices || prices.size === 0) return;

  await admin
    .from("account_balance_history")
    .delete()
    .eq("account_id", accountId)
    .gte("recorded_at", startStr)
    .lte("recorded_at", todayStr);

  const records: {
    account_id: string;
    balance: number;
    recorded_at: string;
    notes: string;
  }[] = [];
  for (const [dateStr, close] of prices) {
    if (dateStr >= startStr && dateStr <= todayStr) {
      const balance = Math.round(close * quantity * 100) / 100;
      if (balance > 0) {
        records.push({
          account_id: accountId,
          balance,
          recorded_at: dateStr,
          notes: `Historical close (${ticker})`,
        });
      }
    }
  }

  for (let i = 0; i < records.length; i += 200) {
    const { error } = await admin
      .from("account_balance_history")
      .insert(records.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
}

/** Default how far back we backfill a stock account's history automatically. */
const AUTO_BACKFILL_LOOKBACK_DAYS = 365 * 2;

/**
 * Refresh current prices for every stock account belonging to a couple, using
 * Yahoo Finance quotes. Updates current_price and last_price_fetched_at on
 * each matching account. Returns the number of accounts successfully updated.
 * Failures are skipped so one bad ticker doesn't abort the batch.
 */
export async function refreshStockPricesForCouple(
  admin: SupabaseClient,
  coupleId: string,
): Promise<number> {
  const { data: stockAccounts } = await admin
    .from("net_worth_accounts")
    .select("id, ticker, current_price")
    .eq("couple_id", coupleId)
    .not("ticker", "is", null);

  if (!stockAccounts || stockAccounts.length === 0) return 0;

  const uniqueTickers = [...new Set(stockAccounts.map((a) => a.ticker!))];

  const quoteMap = new Map<string, number>();
  try {
    const { default: YahooFinance } = await import("yahoo-finance2");
    const yf = new YahooFinance({ suppressNotices: ["ripHistorical"] });
    const quotes = await yf.quote(uniqueTickers);

    const results = Array.isArray(quotes) ? quotes : [quotes];
    for (const q of results) {
      if (q.regularMarketPrice && q.symbol) {
        quoteMap.set(q.symbol, q.regularMarketPrice);
      }
    }
  } catch (e) {
    console.error(
      `Price refresh failed for couple ${coupleId}:`,
      e instanceof Error ? e.message : e,
    );
    return 0;
  }

  let updated = 0;
  for (const account of stockAccounts) {
    const price = quoteMap.get(account.ticker!);
    if (!price) continue;
    const { error } = await admin
      .from("net_worth_accounts")
      .update({
        current_price: price,
        last_price_fetched_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    if (!error) updated += 1;
  }

  return updated;
}

/**
 * Ensure every stock account for the couple has historical snapshots.  For
 * accounts that are missing history (no snapshots, or snapshots that don't
 * reach far enough back), backfill them automatically — so the portfolio chart
 * has data without a manual backfill step.  Accounts that already have
 * sufficient history are left alone (no extra Yahoo calls).
 */
export async function ensureStockHistory(
  admin: SupabaseClient,
  coupleId: string,
): Promise<number> {
  const { data: accounts } = await admin
    .from("net_worth_accounts")
    .select("id, ticker, quantity, created_at")
    .eq("couple_id", coupleId)
    .not("ticker", "is", null);

  if (!accounts || accounts.length === 0) return 0;

  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - AUTO_BACKFILL_LOOKBACK_DAYS);
  const defaultStart = cutoff.toISOString().slice(0, 10);

  let backfilled = 0;

  for (const account of accounts as NetWorthAccount[]) {
    if (!account.quantity || !account.ticker) continue;

    const startFromCreation = (account.created_at ?? defaultStart).slice(0, 10);
    const targetStart = startFromCreation < defaultStart ? startFromCreation : defaultStart;

    const { data: snaps } = await admin
      .from("account_balance_history")
      .select("recorded_at")
      .eq("account_id", account.id)
      .order("recorded_at", { ascending: true })
      .limit(1);

    const earliest = snaps && snaps.length > 0 ? snaps[0].recorded_at : null;
    if (earliest && earliest <= targetStart) continue; // already has full history

    try {
      await backfillAccountHistory(
        admin,
        account.id,
        account.ticker,
        Number(account.quantity),
        targetStart,
      );
      backfilled += 1;
    } catch (e) {
      // Surface individual failures instead of failing silently.
      console.error(
        `Backfill failed for account ${account.id} (${account.ticker}):`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return backfilled;
}

/**
 * Capture "today" snapshots for every account so the net-worth-over-time
 * chart has a fresh point each day.  Stocks use current_price × quantity;
 * bank/managed accounts use their latest recorded balance.  Idempotent: if a
 * snapshot already exists for today it is replaced (upsert), so re-running
 * just refreshes today's value.
 */
export async function captureTodaysSnapshots(
  admin: SupabaseClient,
  coupleId: string,
): Promise<number> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: accounts } = await admin
    .from("net_worth_accounts")
    .select("id, ticker, quantity, current_price, account_category, include_in_net_worth")
    .eq("couple_id", coupleId);

  if (!accounts || accounts.length === 0) return 0;

  const accountIds = (accounts as NetWorthAccount[]).map((a) => a.id);

  // Latest recorded balance per account (bank/managed, or any non-stock).
  const { data: snapshots } = await admin
    .from("account_balance_history")
    .select("account_id, balance, recorded_at")
    .in("account_id", accountIds)
    .order("recorded_at", { ascending: false });

  const latestByAccount = new Map<string, number>();
  if (snapshots) {
    for (const s of snapshots) {
      if (!latestByAccount.has(s.account_id)) {
        latestByAccount.set(s.account_id, Number(s.balance));
      }
    }
  }

  const records: {
    account_id: string;
    balance: number;
    recorded_at: string;
    notes: string;
  }[] = [];

  for (const a of accounts as NetWorthAccount[]) {
    if (a.include_in_net_worth === false) continue;

    let value: number | null = null;
    if (a.ticker && a.current_price && a.quantity) {
      value = Number(a.current_price) * Number(a.quantity);
    } else {
      const latest = latestByAccount.get(a.id);
      value = latest != null ? latest : null;
    }
    if (value == null || value <= 0) continue;

    records.push({
      account_id: a.id,
      balance: Math.round(value * 100) / 100,
      recorded_at: todayStr,
      notes: "Daily snapshot",
    });
  }

  if (records.length === 0) return 0;

  // Upsert: drop any snapshot already recorded today, then insert fresh values.
  await admin
    .from("account_balance_history")
    .delete()
    .in("account_id", accountIds)
    .eq("recorded_at", todayStr);

  for (let i = 0; i < records.length; i += 200) {
    const { error } = await admin
      .from("account_balance_history")
      .insert(records.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }

  return records.length;
}
