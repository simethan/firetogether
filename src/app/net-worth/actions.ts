"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getCurrentUserOrRedirect,
  parseAmount,
  parseDate,
  parseString,
} from "@/lib/actions";

export async function createAccountAction(formData: FormData): Promise<void> {
  const { currentUser, admin } = await getCurrentUserOrRedirect();

  const name = parseString(formData.get("name"));
  const type = parseString(formData.get("type")) ?? "Account";
  const icon = parseString(formData.get("icon"));
  const accountCategory = parseString(formData.get("account_category")) ?? "bank";
  const currency = parseString(formData.get("currency")) ?? "SGD";

  if (!name) {
    redirect("/net-worth?error=Enter%20an%20account%20name.");
  }

  const basePayload: Record<string, unknown> = {
    couple_id: currentUser.couple_id,
    name,
    type,
    icon,
    account_category: accountCategory,
    currency,
  };

  async function insertAccount() {
    const { error } = await admin.from("net_worth_accounts").insert(basePayload);
    if (error) redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);
  }

  if (accountCategory === "bank") {
    basePayload.bank_name = parseString(formData.get("bank_name")) ?? null;
    basePayload.account_number = parseString(formData.get("account_number")) ?? null;

    const { data: account, error } = await admin
      .from("net_worth_accounts")
      .insert(basePayload)
      .select("id")
      .maybeSingle();

    if (error) redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);

    const initialBalance = parseAmount(formData.get("initial_balance"));
    if (account && initialBalance !== null && initialBalance > 0) {
      const { error: be } = await admin.from("account_balance_history").insert({
        account_id: account.id,
        balance: initialBalance,
        recorded_at: new Date().toISOString().slice(0, 10),
        notes: "Initial balance",
      });
      if (be) redirect(`/net-worth?error=${encodeURIComponent(be.message)}`);
    }
  } else if (accountCategory === "investment") {
    basePayload.broker = parseString(formData.get("broker")) ?? null;
    basePayload.ticker = parseString(formData.get("ticker")) ?? null;
    basePayload.exchange = parseString(formData.get("exchange")) ?? null;
    basePayload.quantity = parseAmount(formData.get("quantity")) ?? null;
    basePayload.buy_price = parseAmount(formData.get("buy_price")) ?? null;
    basePayload.current_price = parseAmount(formData.get("current_price")) ?? null;
    basePayload.initial_investment = parseAmount(formData.get("initial_investment")) ?? null;
    await insertAccount();
  } else if (accountCategory === "managed") {
    basePayload.broker = parseString(formData.get("broker")) ?? null;
    basePayload.initial_investment = parseAmount(formData.get("initial_investment")) ?? null;

    const { data: account, error } = await admin
      .from("net_worth_accounts")
      .insert(basePayload)
      .select("id")
      .maybeSingle();

    if (error) redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);

    const currentBalance = parseAmount(formData.get("current_balance"));
    if (account && currentBalance !== null && currentBalance > 0) {
      const { error: be } = await admin.from("account_balance_history").insert({
        account_id: account.id,
        balance: currentBalance,
        recorded_at: new Date().toISOString().slice(0, 10),
        notes: "Current balance",
      });
      if (be) redirect(`/net-worth?error=${encodeURIComponent(be.message)}`);
    }
  } else {
    await insertAccount();
  }

  revalidatePath("/net-worth");
  redirect("/net-worth");
}

export async function deleteAccountAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));

  if (!id) {
    redirect("/net-worth?error=invalid_account_delete");
  }

  const { data: account } = await admin
    .from("net_worth_accounts")
    .select("id, couple_id")
    .eq("id", id)
    .maybeSingle();

  if (!account || account.couple_id !== currentUser.couple_id) {
    redirect("/net-worth?error=account_not_found");
  }

  const { error } = await admin
    .from("net_worth_accounts")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/net-worth");
  redirect("/net-worth");
}

export async function recordBalanceAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const accountId = parseString(formData.get("account_id"));
  const balance = parseAmount(formData.get("balance"));
  const recordedAt = parseDate(formData.get("recorded_at")) ?? new Date().toISOString().slice(0, 10);
  const notes = parseString(formData.get("notes"));

  if (!accountId || balance === null) {
    redirect("/net-worth?error=invalid_balance");
  }

  const { data: account } = await admin
    .from("net_worth_accounts")
    .select("id, couple_id")
    .eq("id", accountId)
    .maybeSingle();

  if (!account || account.couple_id !== currentUser.couple_id) {
    redirect("/net-worth?error=account_not_found");
  }

  const { error } = await admin.from("account_balance_history").insert({
    account_id: accountId,
    balance,
    recorded_at: recordedAt,
    notes: notes ?? null,
  });

  if (error) {
    redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/net-worth");
  redirect("/net-worth");
}

export async function deleteBalanceAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));
  const accountId = parseString(formData.get("account_id"));

  if (!id || !accountId) {
    redirect("/net-worth?error=invalid_balance_delete");
  }

  const { data: account } = await admin
    .from("net_worth_accounts")
    .select("id, couple_id")
    .eq("id", accountId)
    .maybeSingle();

  if (!account || account.couple_id !== currentUser.couple_id) {
    redirect("/net-worth?error=account_not_found");
  }

  const { error } = await admin
    .from("account_balance_history")
    .delete()
    .eq("account_id", accountId)
    .eq("id", id);

  if (error) {
    redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/net-worth");
  redirect("/net-worth");
}

export async function recordDividendAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const accountId = parseString(formData.get("account_id"));
  const amount = parseAmount(formData.get("amount"));
  const payDate = parseDate(formData.get("pay_date")) ?? new Date().toISOString().slice(0, 10);
  const notes = parseString(formData.get("notes"));
  const currency = parseString(formData.get("currency")) ?? "SGD";

  if (!accountId || !amount || amount <= 0) {
    redirect("/net-worth?error=invalid_dividend");
  }

  const { data: account } = await admin
    .from("net_worth_accounts")
    .select("id, couple_id")
    .eq("id", accountId)
    .maybeSingle();

  if (!account || account.couple_id !== currentUser.couple_id) {
    redirect("/net-worth?error=account_not_found");
  }

  const { error } = await admin.from("dividends").insert({
    account_id: accountId,
    amount,
    currency,
    pay_date: payDate,
    notes: notes ?? null,
  });

  if (error) {
    redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/net-worth");
  redirect("/net-worth");
}

export async function deleteDividendAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));
  const accountId = parseString(formData.get("account_id"));

  if (!id || !accountId) {
    redirect("/net-worth?error=invalid_dividend_delete");
  }

  const { data: account } = await admin
    .from("net_worth_accounts")
    .select("id, couple_id")
    .eq("id", accountId)
    .maybeSingle();

  if (!account || account.couple_id !== currentUser.couple_id) {
    redirect("/net-worth?error=account_not_found");
  }

  const { error } = await admin
    .from("dividends")
    .delete()
    .eq("account_id", accountId)
    .eq("id", id);

  if (error) {
    redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/net-worth");
  redirect("/net-worth");
}

export async function refreshStockPricesAction() {
  const { currentUser, admin } = await getCurrentUserOrRedirect();

  const { data: stockAccounts } = await admin
    .from("net_worth_accounts")
    .select("id, ticker, current_price")
    .eq("couple_id", currentUser.couple_id)
    .not("ticker", "is", null);

  if (!stockAccounts || stockAccounts.length === 0) {
    redirect("/net-worth?error=No%20stock%20accounts%20to%20refresh.");
  }

  const uniqueTickers = [...new Set(stockAccounts.map((a) => a.ticker))];

  try {
    const { default: YahooFinance } = await import("yahoo-finance2");
    const yf = new YahooFinance();
    const quotes = await yf.quote(uniqueTickers);

    const quoteMap = new Map<string, number>();
    const results = Array.isArray(quotes) ? quotes : [quotes];
    for (const q of results) {
      if (q.regularMarketPrice && q.symbol) {
        quoteMap.set(q.symbol, q.regularMarketPrice);
      }
    }

    for (const account of stockAccounts) {
      const price = quoteMap.get(account.ticker!);
      if (price) {
        await admin
          .from("net_worth_accounts")
          .update({
            current_price: price,
            last_price_fetched_at: new Date().toISOString(),
          })
          .eq("id", account.id);
      }
    }
  } catch {
    redirect("/net-worth?error=Failed%20to%20fetch%20stock%20prices.%20Try%20again.");
  }

  revalidatePath("/net-worth");
  redirect("/net-worth");
}

/**
 * Bulk-backfill balance snapshots for all accounts on a given date.
 * - Stock accounts: creates snapshots for EVERY trading day from targetDate
 *   to today using Yahoo Finance historical close prices.
 * - Bank/managed accounts: creates snapshots on targetDate, plus month-ends
 *   if include_monthly is checked.
 */
export async function bulkBackfillAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();

  const targetDate = parseString(formData.get("target_date"));
  const includeMonthly = formData.get("include_monthly") === "true";

  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    redirect("/net-worth?error=Enter%20a%20valid%20backfill%20date.");
  }

  // Fetch all accounts for this couple
  const { data: accounts } = await admin
    .from("net_worth_accounts")
    .select("*")
    .eq("couple_id", currentUser.couple_id);

  if (!accounts || accounts.length === 0) {
    redirect("/net-worth?error=No%20accounts%20to%20backfill.");
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // --- Bank/managed accounts: get the latest snapshot balance as of targetDate ---
  const { data: snapshots } = await admin
    .from("account_balance_history")
    .select("*")
    .in("account_id", accounts.map((a) => a.id))
    .lte("recorded_at", targetDate)
    .order("recorded_at", { ascending: false });

  const snapshotAsOf = new Map<string, number>();
  if (snapshots) {
    for (const s of snapshots) {
      if (!snapshotAsOf.has(s.account_id)) {
        snapshotAsOf.set(s.account_id, s.balance);
      }
    }
  }

  // --- Stock accounts: fetch ALL historical trading days from Yahoo Finance ---
  const stockAccts = accounts.filter((a) => a.ticker && a.quantity);
  const uniqueTickers = [...new Set(stockAccts.map((a) => a.ticker!))];
  const historicalPricesByTicker = new Map<string, Map<string, number>>();

  if (stockAccts.length > 0 && uniqueTickers.length > 0) {
    try {
      const dayAfterToday = new Date();
      dayAfterToday.setDate(dayAfterToday.getDate() + 1);
      const dayAfterTodayStr = dayAfterToday.toISOString().slice(0, 10);

      const { default: YahooFinance } = await import("yahoo-finance2");
      const yf = new YahooFinance();

      for (const ticker of uniqueTickers) {
        const result = await yf.historical(ticker, {
          period1: targetDate,
          period2: dayAfterTodayStr,
        });
        const pricesByDate = new Map<string, number>();
        for (const r of result) {
          const d =
            r.date instanceof Date
              ? r.date.toISOString().slice(0, 10)
              : new Date(r.date).toISOString().slice(0, 10);
          pricesByDate.set(d, r.close ?? r.adjClose ?? 0);
        }
        historicalPricesByTicker.set(ticker, pricesByDate);
      }
    } catch {
      redirect("/net-worth?error=Failed%20to%20fetch%20historical%20stock%20prices.%20The%20backfill%20needs%20Yahoo%20Finance%20data%20to%20continue.%20Try%20again%20later.");
    }
  }

  // Delete any existing stock snapshots in the backfill range so we can
  // replace them cleanly (avoids duplicates and stale data on re-run).
  const stockAccountIds = stockAccts.map((a) => a.id);
  if (stockAccountIds.length > 0) {
    await admin
      .from("account_balance_history")
      .delete()
      .in("account_id", stockAccountIds)
      .gte("recorded_at", targetDate)
      .lte("recorded_at", todayStr);
  }

  const records: {
    account_id: string;
    balance: number;
    recorded_at: string;
    notes: string;
  }[] = [];

  for (const account of accounts) {
    if (account.ticker && account.quantity) {
      // --- Stock account: one snapshot per trading day using historical close ---
      const pricesByDate = historicalPricesByTicker.get(account.ticker);

      if (pricesByDate && pricesByDate.size > 0) {
        for (const [dateStr, closePrice] of pricesByDate) {
          if (dateStr >= targetDate && dateStr <= todayStr) {
            const balance = closePrice * Number(account.quantity);
            if (balance > 0) {
              records.push({
                account_id: account.id,
                balance: Math.round(balance * 100) / 100,
                recorded_at: dateStr,
                notes: `Historical close (${account.ticker})`,
              });
            }
          }
        }
      } else {
        // Fallback — no historical data from Yahoo, use current_price
        const balance = Number(account.current_price ?? 0) * Number(account.quantity);
        if (balance > 0) {
          records.push({
            account_id: account.id,
            balance,
            recorded_at: targetDate,
            notes: `Backfilled to ${targetDate} (current price)`,
          });
        }
      }
    } else if (snapshotAsOf.has(account.id)) {
      // --- Bank/managed account: target date snapshot (balance as-of targetDate) ---
      const balance = snapshotAsOf.get(account.id)!;
      if (balance > 0) {
        records.push({
          account_id: account.id,
          balance,
          recorded_at: targetDate,
          notes: `Backfilled to ${targetDate}`,
        });
      }

      // --- Bank/managed: month-end snapshots (optional) ---
      if (includeMonthly) {
        const cursor = new Date(
          Date.UTC(
            new Date(targetDate).getFullYear(),
            new Date(targetDate).getMonth() + 1,
            1,
          ),
        );
        const today = new Date();
        while (cursor <= today) {
          const monthEnd = new Date(
            Date.UTC(cursor.getFullYear(), cursor.getMonth() + 1, 0),
          );
          const dateStr = monthEnd.toISOString().slice(0, 10);
          if (dateStr > targetDate && dateStr <= todayStr) {
            records.push({
              account_id: account.id,
              balance,
              recorded_at: dateStr,
              notes: `Month-end backfill`,
            });
          }
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    }
  }

  if (records.length === 0) {
    redirect("/net-worth?error=No%20balances%20found%20to%20backfill.");
  }

  // Insert in batches
  const batchSize = 200;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await admin.from("account_balance_history").insert(batch);
    if (error) {
      redirect(`/net-worth?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath("/net-worth");
  redirect("/net-worth");
}
