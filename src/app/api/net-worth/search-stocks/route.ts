import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function isEquity(q: { typeDisp?: string; isYahooFinance: boolean }): boolean {
  if (!q.isYahooFinance) return false;
  const type = q.typeDisp ?? "";
  return (
    type.includes("Stock") ||
    type.includes("ETF") ||
    type.includes("Equity") ||
    type === ""
  );
}

/* ─── Tiny in-memory rate limiter (per process / instance) ───────
 * Not shared across serverless instances, but raises the bar against
 * trivial abuse of the Yahoo Finance proxy. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_MAX;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Require an authenticated session (browser sends the Supabase cookie).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (rateLimited(user.id)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  try {
    const { default: YahooFinance } = await import("yahoo-finance2");
    const yf = new YahooFinance();
    const results = await yf.search(query.trim(), {
      quotesCount: 8,
      newsCount: 0,
      enableNavLinks: false,
    });

    const quotes = (results.quotes ?? [])
      .filter(isEquity)
      .slice(0, 8)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname ?? q.symbol,
        exchange: q.exchange ?? "",
        type: q.typeDisp ?? "",
      }));

    return NextResponse.json({ results: quotes });
  } catch {
    return NextResponse.json(
      { error: "Failed to search stocks" },
      { status: 500 },
    );
  }
}
