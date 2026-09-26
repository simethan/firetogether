"use server";

import { redirect } from "next/navigation";

import { parseAmount, parseDate, parseNumber, parseString } from "@/lib/actions";
import { scheduleGroupSync } from "@/lib/groups/bridge";
import { postRecurringOccurrence, RECURRING_COLUMNS, type GroupRecurring } from "@/lib/groups/recurring";
import { groupPath, logActivity, requireGroupMember, withError, withNotice } from "@/lib/groups/server";
import { GROUP_CATEGORIES, SUPPORTED_CURRENCIES } from "@/lib/groups/types";

export async function addCommentAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me } = await requireGroupMember(code);
  const expenseId = parseString(formData.get("expense_id"));
  const body = parseString(formData.get("body"));
  const back = groupPath(group.code, `/expenses/${expenseId}`);

  if (!body) redirect(withError(back, "Write something first."));
  const { data: expense } = await admin.from("group_expenses").select("id, group_id").eq("id", expenseId).maybeSingle();
  if (!expense || expense.group_id !== group.id) redirect(withError(groupPath(group.code), "Expense not found."));

  await admin
    .from("group_comments")
    .insert({ group_id: group.id, expense_id: expense.id, member_id: me.id, body: body.slice(0, 2000) });
  await logActivity(admin, group.id, me, "COMMENT_ADDED", { receiptId: expense.id });
  redirect(back);
}

export async function disputeItemAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, isAdmin } = await requireGroupMember(code);
  const itemId = parseString(formData.get("item_id"));
  const action = String(formData.get("action") ?? "open");

  const { data: item } = await admin
    .from("group_expense_items")
    .select("id, group_id, expense_id, name, paid_by_member_id, disputed_by_member_id, dispute_status")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.group_id !== group.id) redirect(withError(groupPath(group.code), "Item not found."));
  const back = groupPath(group.code, `/expenses/${item.expense_id}`);

  const { data: expense } = await admin
    .from("group_expenses")
    .select("paid_by_member_id")
    .eq("id", item.expense_id)
    .maybeSingle();
  const payer = item.paid_by_member_id ?? expense?.paid_by_member_id;

  if (action === "open") {
    await admin
      .from("group_expense_items")
      .update({
        dispute_status: "open",
        dispute_reason: parseString(formData.get("reason")),
        disputed_by_member_id: me.id,
        disputed_at: new Date().toISOString(),
        resolved_at: null,
      })
      .eq("id", item.id);
    await logActivity(admin, group.id, me, "ITEM_DISPUTED", { receiptId: item.expense_id, itemName: item.name });
    redirect(withNotice(back, "Dispute raised."));
  }

  const canResolve = isAdmin || me.id === payer || me.id === item.disputed_by_member_id;
  if (!canResolve) redirect(withError(back, "Only the payer, the person who disputed it, or an admin can do that."));

  if (action === "resolve") {
    await admin
      .from("group_expense_items")
      .update({ dispute_status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", item.id);
    await logActivity(admin, group.id, me, "DISPUTE_RESOLVED", { receiptId: item.expense_id, itemName: item.name });
  } else {
    await admin
      .from("group_expense_items")
      .update({ dispute_status: "none", dispute_reason: null, disputed_by_member_id: null, disputed_at: null, resolved_at: null })
      .eq("id", item.id);
    await logActivity(admin, group.id, me, "DISPUTE_REMOVED", { receiptId: item.expense_id, itemName: item.name });
  }
  redirect(back);
}

function pickCategory(value: string | null) {
  return value && (GROUP_CATEGORIES as readonly string[]).includes(value) ? value : null;
}

export async function saveGroupBudgetAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me } = await requireGroupMember(code, { admin: true });
  const back = groupPath(group.code, "?tab=insights");
  const amount = parseAmount(formData.get("amount"));
  const threshold = parseNumber(formData.get("alert_threshold")) ?? 80;
  const period = String(formData.get("period") ?? "monthly");

  if (!amount || amount <= 0) redirect(withError(back, "Enter a budget amount."));
  if (!["weekly", "monthly", "total"].includes(period)) redirect(withError(back, "Choose a period."));

  const { error } = await admin.from("group_budgets").insert({
    group_id: group.id,
    category: pickCategory(parseString(formData.get("category"))),
    amount,
    period,
    alert_threshold: Math.min(100, Math.max(1, Math.round(threshold))),
  });
  if (error) redirect(withError(back, error.message));
  await logActivity(admin, group.id, me, "BUDGET_CREATED", { amount, period });
  redirect(withNotice(back, "Budget added."));
}

export async function deleteGroupBudgetAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group } = await requireGroupMember(code, { admin: true });
  await admin.from("group_budgets").delete().eq("id", parseString(formData.get("budget_id"))).eq("group_id", group.id);
  redirect(groupPath(group.code, "?tab=insights"));
}

export async function createGroupRecurringAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, members } = await requireGroupMember(code);
  const back = groupPath(group.code, "?tab=insights");

  const amount = parseAmount(formData.get("amount"));
  const name = parseString(formData.get("name"));
  const startDate = parseDate(formData.get("start_date"));
  const frequency = String(formData.get("frequency") ?? "monthly");
  const paidBy = parseString(formData.get("paid_by")) ?? me.id;
  const currencyInput = parseString(formData.get("currency"))?.toUpperCase();

  if (!name) redirect(withError(back, "Name the recurring expense."));
  if (!amount || amount <= 0) redirect(withError(back, "Enter an amount."));
  if (!startDate) redirect(withError(back, "Choose a start date."));
  if (!["weekly", "monthly", "yearly"].includes(frequency)) redirect(withError(back, "Choose how often."));
  if (!members.some((m) => m.id === paidBy)) redirect(withError(back, "Choose who pays."));

  const { error } = await admin.from("scheduled_transactions").insert({
    couple_id: null,
    group_id: group.id,
    user_id: me.user_id,
    group_paid_by_member_id: paidBy,
    group_category: pickCategory(parseString(formData.get("category"))) ?? "Bills & Utilities",
    amount,
    currency:
      currencyInput && (SUPPORTED_CURRENCIES as readonly string[]).includes(currencyInput)
        ? currencyInput
        : group.base_currency,
    description: name,
    split_type: "shared",
    frequency,
    frequency_interval: 1,
    next_date: startDate,
    end_date: parseDate(formData.get("end_date")),
  });
  if (error) redirect(withError(back, error.message));
  await logActivity(admin, group.id, me, "RECURRING_CREATED", { name, amount, frequency });
  redirect(withNotice(back, "Recurring expense added. It posts automatically on each due date."));
}

async function loadRecurring(code: string, formData: FormData) {
  const context = await requireGroupMember(code);
  const { data } = await context.admin
    .from("scheduled_transactions")
    .select(RECURRING_COLUMNS)
    .eq("id", parseString(formData.get("recurring_id")))
    .eq("group_id", context.group.id)
    .maybeSingle();
  const back = groupPath(context.group.code, "?tab=insights");
  if (!data) redirect(withError(back, "Recurring expense not found."));
  return { ...context, recurring: data as GroupRecurring, back };
}

export async function postGroupRecurringAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, recurring, back } = await loadRecurring(code, formData);
  const expenseId = await postRecurringOccurrence(admin, recurring);
  if (!expenseId) redirect(withError(back, "Could not post it."));
  scheduleGroupSync(admin, group.id);
  redirect(withNotice(back, "Posted."));
}

export async function toggleGroupRecurringAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, recurring, back } = await loadRecurring(code, formData);
  await admin.from("scheduled_transactions").update({ is_active: !recurring.is_active }).eq("id", recurring.id);
  redirect(back);
}

export async function deleteGroupRecurringAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, recurring, back } = await loadRecurring(code, formData);
  await admin.from("scheduled_transactions").delete().eq("id", recurring.id);
  await logActivity(admin, group.id, me, "RECURRING_DELETED", { name: recurring.description });
  redirect(back);
}
