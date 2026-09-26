import { NextResponse, type NextRequest } from "next/server";

import { cronAuthError } from "@/lib/cron";
import { processDueReceipts } from "@/lib/groups/receipts";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Retries receipts whose OCR failed transiently, and recovers ones stuck mid-read. */
export async function GET(request: NextRequest) {
  const authError = cronAuthError(request);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

  const admin = createServiceClient();
  const { data: rows, error } = await admin
    .from("group_expenses")
    .select("group_id")
    .in("parse_status", ["pending_ocr", "processing"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groupIds = [...new Set((rows ?? []).map((r: { group_id: string }) => r.group_id))];
  let processed = 0;
  for (const groupId of groupIds) {
    processed += await processDueReceipts(admin, groupId, 10);
  }
  return NextResponse.json({ groups: groupIds.length, processed });
}
