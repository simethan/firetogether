import crypto from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { scheduleGroupSync } from "@/lib/groups/bridge";
import { processReceipt, RECEIPT_BUCKET } from "@/lib/groups/receipts";
import { getGroupContext, logActivity } from "@/lib/groups/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/groups/[code]/receipts">) {
  const { code } = await ctx.params;
  const context = await getGroupContext(code);
  if (!context) return NextResponse.json({ error: "not_found", message: "Group not found." }, { status: 404 });
  if (!context.me) {
    return NextResponse.json({ error: "forbidden", message: "Join the group to upload receipts." }, { status: 403 });
  }

  const { admin, group, me, members } = context;
  const form = await request.formData();
  const file = form.get("file");
  const paidById = String(form.get("paidById") ?? me.id);
  const assignToId = String(form.get("assignToId") ?? "") || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "invalid", message: "Choose a file to upload." }, { status: 400 });
  }
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: "invalid", message: "Use a JPG, PNG, HEIC, or PDF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "invalid", message: "That file is over 8 MB." }, { status: 413 });
  }
  if (!members.some((m) => m.id === paidById)) {
    return NextResponse.json({ error: "invalid", message: "Choose who paid." }, { status: 400 });
  }
  if (assignToId && !members.some((m) => m.id === assignToId)) {
    return NextResponse.json({ error: "invalid", message: "Choose someone in the group." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");

  const { data: duplicate } = await admin
    .from("group_expenses")
    .select("id")
    .eq("group_id", group.id)
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (duplicate) {
    return NextResponse.json(
      { error: "duplicate_receipt", message: "This receipt was already uploaded.", expenseId: duplicate.id },
      { status: 409 },
    );
  }

  const path = `${group.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage
    .from(RECEIPT_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: "upload_failed", message: uploadError.message }, { status: 500 });
  }

  const { data: expense, error } = await admin
    .from("group_expenses")
    .insert({
      group_id: group.id,
      paid_by_member_id: paidById,
      created_by_member_id: me.id,
      kind: "receipt",
      currency: group.base_currency,
      receipt_path: path,
      receipt_content_type: file.type,
      content_hash: contentHash,
      parse_status: "pending_ocr",
    })
    .select("id")
    .single();
  if (error || !expense) {
    await admin.storage.from(RECEIPT_BUCKET).remove([path]);
    const isDuplicate = error?.message.includes("duplicate");
    return NextResponse.json(
      {
        error: isDuplicate ? "duplicate_receipt" : "insert_failed",
        message: isDuplicate ? "This receipt was already uploaded." : error?.message,
      },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  const outcome = await processReceipt(admin, expense.id, { assignToMemberId: assignToId });

  if (outcome.status === "not_a_receipt") {
    return NextResponse.json(
      { error: "not_a_receipt", message: "Doesn't look like a receipt or payment." },
      { status: 422 },
    );
  }

  if (outcome.status === "payment") {
    scheduleGroupSync(admin, group.id);
    return NextResponse.json({ status: "payment", paymentId: outcome.paymentId });
  }

  await logActivity(admin, group.id, me, "RECEIPT_UPLOADED", { receiptId: expense.id });
  scheduleGroupSync(admin, group.id);

  return NextResponse.json({
    status: outcome.status === "skipped" ? "processing" : outcome.status,
    expenseId: expense.id,
    note: "note" in outcome ? outcome.note : null,
  });
}
