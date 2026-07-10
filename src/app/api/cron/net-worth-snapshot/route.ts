import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  captureTodaysSnapshots,
  refreshStockPricesForCouple,
} from "@/lib/net-worth-backfill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Scheduled job (see vercel.json) that keeps net-worth history growing
 * automatically.  For every couple it:
 *   1. refreshes stock prices from Yahoo Finance, then
 *   2. captures "today" balance snapshots for all accounts (upsert, idempotent).
 *
 * Protected by CRON_SECRET — call with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 500 },
    );
  }

  const auth =
    request.headers.get("authorization") ?? request.headers.get("x-cron-secret");
  if (auth !== `Bearer ${secret}` && auth !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();

  const { data: rows, error } = await admin
    .from("net_worth_accounts")
    .select("couple_id")
    .not("couple_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const coupleIds = [
    ...new Set((rows ?? []).map((r) => r.couple_id).filter(Boolean)),
  ];

  const results: Array<{
    coupleId: string;
    refreshed?: number;
    captured?: number;
    error?: string;
  }> = [];

  for (const coupleId of coupleIds) {
    try {
      const refreshed = await refreshStockPricesForCouple(admin, coupleId);
      const captured = await captureTodaysSnapshots(admin, coupleId);
      results.push({ coupleId, refreshed, captured });
    } catch (e) {
      results.push({
        coupleId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    couples: coupleIds.length,
    results,
  });
}
