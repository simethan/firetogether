"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseAmount, parseDate, parseString } from "@/lib/actions";
import { scheduleGroupSync } from "@/lib/groups/bridge";
import type { SaveExpenseInput, SaveExpenseResult } from "@/lib/groups/editor-types";
import { processReceipt, RECEIPT_BUCKET } from "@/lib/groups/receipts";
import {
  groupPath,
  loadGroupData,
  logActivity,
  requireGroupMember,
  withError,
  withNotice,
} from "@/lib/groups/server";
import { GROUP_CATEGORIES, SUPPORTED_CURRENCIES } from "@/lib/groups/types";
import {
  allocatePayments,
  assignmentKey,
  computeAssignmentAmounts,
  computeExpenseTotal,
  itemsSubtotal,
  lockedItemIds,
  round2,
  validateItemSplit,
  type SplitItemInput,
} from "@/lib/splitting";

function pickCategory(value: string | null | undefined) {
  return value && (GROUP_CATEGORIES as readonly string[]).includes(value) ? value : "Miscellaneous";
}

function pickCurrency(value: string | null | undefined, fallback: string) {
  const code = value?.toUpperCase();
  return code && (SUPPORTED_CURRENCIES as readonly string[]).includes(code) ? code : fallback;
}

export async function createManualExpenseAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, members } = await requireGroupMember(code);
  const back = groupPath(group.code, "/expenses/new");

  const description = parseString(formData.get("description"));
  const amount = parseAmount(formData.get("amount"));
  const date = parseDate(formData.get("date")) ?? new Date().toISOString().slice(0, 10);
  const category = pickCategory(parseString(formData.get("category")));
  const currency = pickCurrency(parseString(formData.get("currency")), group.base_currency);
  const paidBy = parseString(formData.get("paid_by")) ?? me.id;
  const splitBetween = formData
    .getAll("split_between")
    .map(String)
    .filter((id) => members.some((m) => m.id === id));

  if (!amount || amount <= 0) redirect(withError(back, "Enter an amount greater than 0."));
  if (!members.some((m) => m.id === paidBy)) redirect(withError(back, "Choose who paid."));
  if (splitBetween.length === 0) redirect(withError(back, "Tap the people this expense should be split between."));

  const total = round2(amount);
  const { data: expense, error } = await admin
    .from("group_expenses")
    .insert({
      group_id: group.id,
      paid_by_member_id: paidBy,
      created_by_member_id: me.id,
      kind: "manual",
      merchant: description,
      expense_date: date,
      currency,
      total,
      category,
      parse_status: "manual",
    })
    .select("id")
    .single();
  if (error || !expense) redirect(withError(back, error?.message ?? "Could not add the expense."));

  const { data: item, error: itemError } = await admin
    .from("group_expense_items")
    .insert({
      expense_id: expense.id,
      group_id: group.id,
      name: description ?? category,
      quantity: 1,
      unit_price: total,
      line_total: total,
      split_method: "equal",
    })
    .select("id")
    .single();
  if (itemError || !item) redirect(withError(back, itemError?.message ?? "Could not add the expense."));

  const [shares] = computeAssignmentAmounts(
    [{ lineTotal: total, splitMethod: "equal", assignments: splitBetween.map((memberId) => ({ memberId, share: 1 })) }],
    total,
  );
  await admin.from("item_assignments").insert(
    splitBetween.map((memberId) => ({
      item_id: item.id,
      member_id: memberId,
      group_id: group.id,
      share: 1,
      amount: shares.get(memberId) ?? 0,
    })),
  );

  await logActivity(admin, group.id, me, "RECEIPT_UPLOADED", { receiptId: expense.id, manual: true });
  scheduleGroupSync(admin, group.id);
  redirect(withNotice(groupPath(group.code), "Expense added."));
}

export async function saveExpenseAction(input: SaveExpenseInput): Promise<SaveExpenseResult> {
  const context = await requireGroupMember(input.code);
  const { admin, group, me, allMembers } = context;

  const data = await loadGroupData(admin, group);
  const expense = data.expenses.find((e) => e.id === input.expenseId);
  if (!expense) return { ok: false, error: "Expense not found." };
  if (expense.parse_status === "pending_ocr" || expense.parse_status === "processing") {
    return { ok: false, error: "This receipt is still being read. Try again in a moment." };
  }

  const memberIds = new Set(allMembers.filter((m) => !m.banned).map((m) => m.id));
  if (!memberIds.has(input.paidByMemberId)) return { ok: false, error: "Choose who paid." };

  const existingItems = data.items.filter((i) => i.expense_id === expense.id);
  const existingAssignments = data.assignments.filter((a) => existingItems.some((i) => i.id === a.item_id));
  const locked = lockedItemIds(allocatePayments(data.ledgerExpenses, data.ledgerPayments));
  const lockedHere = existingItems.filter((i) => locked.has(i.id));

  const currency = pickCurrency(input.currency, expense.currency);
  const charges = {
    serviceChargePercent: input.serviceChargePercent,
    taxPercent: input.taxPercent,
    discount: Math.max(0, input.discount || 0),
  };

  if (lockedHere.length) {
    const headerChanged =
      currency !== expense.currency ||
      input.paidByMemberId !== expense.paid_by_member_id ||
      (charges.serviceChargePercent ?? null) !== (expense.service_charge_percent ?? null) ||
      (charges.taxPercent ?? null) !== (expense.tax_percent ?? null) ||
      round2(charges.discount) !== round2(expense.discount);
    if (headerChanged) {
      return { ok: false, error: "Locked by a payment — delete the payment to change who paid, the currency or charges." };
    }
  }

  const items = input.items.map((item) => ({
    ...item,
    name: item.name.trim() || "Item",
    lineTotal: round2((item.quantity || 0) * (item.unitPrice || 0)),
    shares: Object.fromEntries(
      Object.entries(item.shares).filter(([memberId, share]) => memberIds.has(memberId) && share > 0),
    ),
  }));

  for (const lockedItem of lockedHere) {
    const incoming = items.find((i) => i.id === lockedItem.id);
    const storedShares = existingAssignments.filter((a) => a.item_id === lockedItem.id);
    const sameShares =
      incoming &&
      Object.keys(incoming.shares).length === storedShares.length &&
      storedShares.every((a) => Math.abs((incoming.shares[a.member_id] ?? -1) - a.share) < 0.0001);
    if (!incoming || Math.abs(incoming.lineTotal - lockedItem.line_total) > 0.001 || !sameShares) {
      return { ok: false, error: `"${lockedItem.name}" is locked by a payment — delete the payment to edit it.` };
    }
  }

  const splitInputs: SplitItemInput[] = items.map((item) => ({
    lineTotal: item.lineTotal,
    splitMethod: item.splitMethod,
    assignments: Object.entries(item.shares).map(([memberId, share]) => ({ memberId, share })),
  }));
  for (const [index, split] of splitInputs.entries()) {
    const problem = validateItemSplit(split);
    if (problem) return { ok: false, error: `${items[index].name}: ${problem}` };
  }

  const total = computeExpenseTotal(itemsSubtotal(splitInputs), charges);
  const amounts = computeAssignmentAmounts(splitInputs, total);

  const { error: headerError } = await admin
    .from("group_expenses")
    .update({
      merchant: input.merchant.trim() || null,
      expense_date: /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : expense.expense_date,
      currency,
      category: pickCategory(input.category),
      paid_by_member_id: input.paidByMemberId,
      service_charge_percent: charges.serviceChargePercent,
      tax_percent: charges.taxPercent,
      discount: round2(charges.discount),
      total,
      parse_status: input.markVerified ? "verified" : expense.parse_status === "failed" ? "manual" : expense.parse_status,
      parse_note: input.markVerified ? null : expense.parse_note,
    })
    .eq("id", expense.id);
  if (headerError) return { ok: false, error: headerError.message };

  const keepIds = new Set(items.map((i) => i.id).filter(Boolean));
  const removed = existingItems.filter((i) => !keepIds.has(i.id) && !locked.has(i.id)).map((i) => i.id);
  if (removed.length) await admin.from("group_expense_items").delete().in("id", removed);

  const assignmentRows: Record<string, unknown>[] = [];
  const unlockedIds: string[] = [];

  for (const [index, item] of items.entries()) {
    const existing = item.id ? existingItems.find((i) => i.id === item.id) : undefined;
    if (existing && locked.has(existing.id)) continue;

    const row = {
      expense_id: expense.id,
      group_id: group.id,
      paid_by_member_id: null,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.lineTotal,
      category: item.category && item.category !== input.category ? pickCategory(item.category) : null,
      split_method: item.splitMethod,
      sort_order: index,
    };

    let itemId = existing?.id;
    if (existing) {
      const { error } = await admin.from("group_expense_items").update(row).eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { data: inserted, error } = await admin.from("group_expense_items").insert(row).select("id").single();
      if (error || !inserted) return { ok: false, error: error?.message ?? "Could not save an item." };
      itemId = inserted.id;
    }

    unlockedIds.push(itemId!);
    for (const [memberId, share] of Object.entries(item.shares)) {
      assignmentRows.push({
        item_id: itemId,
        member_id: memberId,
        group_id: group.id,
        share,
        amount: amounts[index].get(memberId) ?? 0,
      });
    }
  }

  if (unlockedIds.length) await admin.from("item_assignments").delete().in("item_id", unlockedIds);
  if (assignmentRows.length) {
    const { error } = await admin.from("item_assignments").insert(assignmentRows);
    if (error) return { ok: false, error: error.message };
  }

  await logActivity(admin, group.id, me, "RECEIPT_EDITED", { receiptId: expense.id });
  scheduleGroupSync(admin, group.id);
  revalidatePath(groupPath(group.code));
  return { ok: true };
}

export async function deleteExpenseAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const expenseId = parseString(formData.get("expense_id"));
  const { admin, group, me, isAdmin } = await requireGroupMember(code);
  const data = await loadGroupData(admin, group);
  const expense = data.expenses.find((e) => e.id === expenseId);
  const back = groupPath(group.code, `/expenses/${expenseId}`);

  if (!expense) redirect(withError(groupPath(group.code), "Expense not found."));
  if (!isAdmin && expense.created_by_member_id !== me.id && expense.paid_by_member_id !== me.id) {
    redirect(withError(back, "Only the uploader, the payer or an admin can delete this."));
  }

  const settled = allocatePayments(data.ledgerExpenses, data.ledgerPayments);
  const itemIds = data.items.filter((i) => i.expense_id === expense.id).map((i) => i.id);
  const hasSettled = data.assignments.some(
    (a) => itemIds.includes(a.item_id) && (settled.get(assignmentKey(a.item_id, a.member_id)) ?? 0) > 0,
  );
  if (hasSettled) redirect(withError(back, "Locked by a payment — delete the payment first."));

  if (expense.receipt_path) await admin.storage.from(RECEIPT_BUCKET).remove([expense.receipt_path]);
  await admin.from("group_expenses").delete().eq("id", expense.id);
  await logActivity(admin, group.id, me, "RECEIPT_DELETED", { receiptId: expense.id, merchant: expense.merchant });
  scheduleGroupSync(admin, group.id);
  redirect(withNotice(groupPath(group.code), "Expense deleted."));
}

export async function retryReceiptAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const expenseId = parseString(formData.get("expense_id"));
  const { admin, group } = await requireGroupMember(code);
  const back = groupPath(group.code, `/expenses/${expenseId}`);

  const { data: expense } = await admin
    .from("group_expenses")
    .select("id, group_id, receipt_path, parse_status")
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense || expense.group_id !== group.id || !expense.receipt_path) {
    redirect(withError(back, "Nothing to retry."));
  }

  const { count } = await admin
    .from("group_expense_items")
    .select("id", { count: "exact", head: true })
    .eq("expense_id", expense.id);
  if ((count ?? 0) > 0) redirect(withError(back, "This receipt already has items. Edit them instead."));

  await admin
    .from("group_expenses")
    .update({ parse_status: "pending_ocr", parse_attempts: 0, parse_note: null })
    .eq("id", expense.id)
    .in("parse_status", ["failed", "pending_ocr"]);
  const outcome = await processReceipt(admin, expense.id);

  scheduleGroupSync(admin, group.id);
  if (outcome.status === "not_a_receipt") {
    redirect(withNotice(groupPath(group.code), "That didn't look like a receipt, so it was removed."));
  }
  if (outcome.status === "payment") {
    redirect(withNotice(groupPath(group.code, "?tab=balances"), "Recorded as a payment — waiting for approval."));
  }
  redirect(back);
}
