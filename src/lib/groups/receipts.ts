import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { OcrNotConfiguredError, readReceipt } from "@/lib/groups/ocr";
import { EXPENSE_COLUMNS, logActivity, MEMBER_COLUMNS } from "@/lib/groups/server";
import {
  GROUP_CATEGORIES,
  SUPPORTED_CURRENCIES,
  type GroupExpense,
  type GroupMember,
} from "@/lib/groups/types";
import { computeAssignmentAmounts, computeExpenseTotal, itemsSubtotal, round2 } from "@/lib/splitting";

export const MAX_PARSE_ATTEMPTS = 6;
export const RECEIPT_BUCKET = "receipts";
const PROCESSING_LEASE_MS = 10 * 60_000;

export type ProcessOutcome =
  | { status: "parsed"; expenseId: string }
  | { status: "retry"; expenseId: string; note: string }
  | { status: "failed"; expenseId: string; note: string }
  | { status: "not_a_receipt" }
  | { status: "payment"; paymentId: string }
  | { status: "skipped" };

const UNREADABLE_TYPES = new Set(["image/heic", "image/heif"]);

/**
 * Read a pending receipt and turn it into items. Safe to call repeatedly:
 * only one caller can claim a receipt at a time.
 */
export async function processReceipt(
  admin: SupabaseClient,
  expenseId: string,
  options: { assignToMemberId?: string | null } = {},
): Promise<ProcessOutcome> {
  // While processing, next_parse_at is the lease expiry the cron uses to recover stuck reads.
  const { data: claimed } = await admin
    .from("group_expenses")
    .update({ parse_status: "processing", next_parse_at: new Date(Date.now() + PROCESSING_LEASE_MS).toISOString() })
    .eq("id", expenseId)
    .eq("parse_status", "pending_ocr")
    .select(EXPENSE_COLUMNS)
    .maybeSingle();
  if (!claimed) return { status: "skipped" };

  const expense = claimed as GroupExpense;
  const attempts = expense.parse_attempts + 1;
  const contentType = expense.receipt_content_type ?? "image/jpeg";

  const fail = async (note: string): Promise<ProcessOutcome> => {
    await admin
      .from("group_expenses")
      .update({ parse_status: "failed", parse_attempts: attempts, parse_note: note, next_parse_at: null })
      .eq("id", expense.id);
    return { status: "failed", expenseId: expense.id, note };
  };

  if (!expense.receipt_path) return fail("No receipt image attached.");
  if (UNREADABLE_TYPES.has(contentType)) {
    return fail("HEIC photos can't be read automatically. Add the items manually or upload a JPG.");
  }

  try {
    const { data: blob, error } = await admin.storage.from(RECEIPT_BUCKET).download(expense.receipt_path);
    if (error || !blob) throw new Error(error?.message ?? "Could not download receipt");
    const result = await readReceipt(Buffer.from(await blob.arrayBuffer()), contentType);

    if (result.docType === "other") {
      await admin.storage.from(RECEIPT_BUCKET).remove([expense.receipt_path]);
      await admin.from("group_expenses").delete().eq("id", expense.id);
      return { status: "not_a_receipt" };
    }

    if (result.docType === "payment") {
      return await recordPaymentScreenshot(admin, expense, result, fail);
    }

    const currency =
      result.currency && (SUPPORTED_CURRENCIES as readonly string[]).includes(result.currency)
        ? result.currency
        : expense.currency;
    const category = result.category ?? expense.category;
    const charges = {
      serviceChargePercent: result.serviceChargePercent,
      taxPercent: result.taxPercent,
      discount: result.discount ?? 0,
    };

    let items = result.items;
    if (items.length === 0 && result.total) {
      items = [{ name: result.merchant ?? "Receipt total", quantity: 1, unitPrice: result.total, total: result.total }];
      charges.serviceChargePercent = null;
      charges.taxPercent = null;
      charges.discount = 0;
    }
    if (items.length === 0) return fail("No items found on this receipt. Add them manually.");

    const subtotal = itemsSubtotal(items.map((i) => ({ lineTotal: i.total })));
    const computed = computeExpenseTotal(subtotal, charges);
    const mismatch = result.total != null && Math.abs(result.total - computed) > Math.max(0.05, computed * 0.01);

    const itemRows = items.map((item, index) => ({
      expense_id: expense.id,
      group_id: expense.group_id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.total,
      category: item.category && item.category !== category ? item.category : null,
      split_method: "equal",
      sort_order: index,
    }));
    const { data: inserted, error: itemError } = await admin
      .from("group_expense_items")
      .insert(itemRows)
      .select("id, line_total, sort_order")
      .order("sort_order");
    if (itemError) throw new Error(itemError.message);

    if (options.assignToMemberId && inserted?.length) {
      const splits = computeAssignmentAmounts(
        inserted.map((row: { line_total: number }) => ({
          lineTotal: Number(row.line_total),
          splitMethod: "equal" as const,
          assignments: [{ memberId: options.assignToMemberId!, share: 1 }],
        })),
        computed,
      );
      await admin.from("item_assignments").insert(
        inserted.map((row: { id: string }, index: number) => ({
          item_id: row.id,
          member_id: options.assignToMemberId,
          group_id: expense.group_id,
          share: 1,
          amount: splits[index].get(options.assignToMemberId!) ?? 0,
        })),
      );
    }

    await admin
      .from("group_expenses")
      .update({
        parse_status: "parsed",
        parse_attempts: attempts,
        next_parse_at: null,
        parse_note: mismatch
          ? `The receipt says ${result.total?.toFixed(2)} but the items add up to ${computed.toFixed(2)} — check the items.`
          : null,
        merchant: result.merchant ?? expense.merchant,
        expense_date: result.date ?? expense.expense_date,
        receipt_number: result.receiptNumber,
        currency,
        category: (GROUP_CATEGORIES as readonly string[]).includes(category) ? category : "Miscellaneous",
        service_charge_percent: charges.serviceChargePercent,
        tax_percent: charges.taxPercent,
        discount: round2(charges.discount),
        total: computed,
        ocr_raw_text: result.rawText,
      })
      .eq("id", expense.id);

    return { status: "parsed", expenseId: expense.id };
  } catch (error) {
    if (error instanceof OcrNotConfiguredError) return fail(error.message);
    if (attempts >= MAX_PARSE_ATTEMPTS) return fail("Couldn't read this receipt. Add the items manually.");

    const backoffMinutes = 2 ** attempts;
    const note = "Still reading — check back later.";
    await admin
      .from("group_expenses")
      .update({
        parse_status: "pending_ocr",
        parse_attempts: attempts,
        next_parse_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
        parse_note: note,
      })
      .eq("id", expense.id);
    console.error("receipt OCR failed", expense.id, error);
    return { status: "retry", expenseId: expense.id, note };
  }
}

/** Retry this group's receipts whose backoff has elapsed (or whose processing lease expired). */
export async function processDueReceipts(admin: SupabaseClient, groupId: string, limit = 3) {
  const now = new Date().toISOString();
  await admin
    .from("group_expenses")
    .update({ parse_status: "pending_ocr", next_parse_at: now })
    .eq("group_id", groupId)
    .eq("parse_status", "processing")
    .lt("next_parse_at", now);

  const { data: due } = await admin
    .from("group_expenses")
    .select("id")
    .eq("group_id", groupId)
    .eq("parse_status", "pending_ocr")
    .or(`next_parse_at.is.null,next_parse_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const row of due ?? []) {
    const outcome = await processReceipt(admin, row.id);
    if (outcome.status !== "skipped") processed++;
  }
  return processed;
}

async function recordPaymentScreenshot(
  admin: SupabaseClient,
  expense: GroupExpense,
  result: { amount: number | null; currency: string | null; receiverName: string | null },
  fail: (note: string) => Promise<ProcessOutcome>,
): Promise<ProcessOutcome> {
  const { data: memberRows } = await admin
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", expense.group_id)
    .is("removed_at", null)
    .eq("banned", false);
  const members = (memberRows ?? []) as GroupMember[];

  const receiverName = result.receiverName?.toLowerCase() ?? "";
  const receiver = receiverName
    ? members.find((m) => {
        const nickname = m.nickname.toLowerCase();
        return receiverName.includes(nickname) || nickname.includes(receiverName);
      })
    : undefined;
  const payerId = expense.paid_by_member_id;

  if (!result.amount || !receiver || !payerId || receiver.id === payerId) {
    return fail("This looks like a payment screenshot. Record it from Balances → Settle up instead.");
  }

  const { data: payment, error } = await admin
    .from("group_payments")
    .insert({
      group_id: expense.group_id,
      payer_member_id: payerId,
      receiver_member_id: receiver.id,
      amount: round2(result.amount),
      currency:
        result.currency && (SUPPORTED_CURRENCIES as readonly string[]).includes(result.currency)
          ? result.currency
          : expense.currency,
      status: "pending",
      proof_path: expense.receipt_path,
      recorded_by_member_id: expense.created_by_member_id,
      note: "Read from a payment screenshot",
    })
    .select("id")
    .single();
  if (error || !payment) return fail(error?.message ?? "Could not record the payment.");

  await admin.from("group_expenses").delete().eq("id", expense.id);
  const recorder = members.find((m) => m.id === expense.created_by_member_id) ?? null;
  await logActivity(admin, expense.group_id, recorder, "PAYMENT_RECORDED", {
    paymentId: payment.id,
    amount: round2(result.amount),
    receiverName: receiver.nickname,
    fromScreenshot: true,
  });
  return { status: "payment", paymentId: payment.id };
}
