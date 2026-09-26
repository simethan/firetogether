import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MEMBER_COLUMNS, logActivity } from "@/lib/groups/server";
import type { GroupMember } from "@/lib/groups/types";
import { computeAssignmentAmounts, round2 } from "@/lib/splitting";

export type GroupRecurring = {
  id: string;
  group_id: string;
  group_paid_by_member_id: string | null;
  group_category: string | null;
  amount: number;
  currency: string | null;
  description: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  frequency_interval: number;
  next_date: string;
  end_date: string | null;
  is_active: boolean;
};

export const RECURRING_COLUMNS =
  "id, group_id, group_paid_by_member_id, group_category, amount, currency, description, frequency, frequency_interval, next_date, end_date, is_active";

export function advanceDate(dateStr: string, frequency: string, interval: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (frequency === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7 * interval);
  } else if (frequency === "yearly") {
    d.setUTCFullYear(d.getUTCFullYear() + interval);
  } else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + interval);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Post one occurrence of a group recurring expense: a manual expense split
 * equally among everyone currently in the group. Advances next_date.
 */
export async function postRecurringOccurrence(admin: SupabaseClient, recurring: GroupRecurring) {
  const { data: memberRows } = await admin
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", recurring.group_id)
    .is("removed_at", null)
    .eq("banned", false);
  const members = (memberRows ?? []) as GroupMember[];
  if (!members.length) return null;

  const { data: group } = await admin
    .from("split_groups")
    .select("base_currency")
    .eq("id", recurring.group_id)
    .maybeSingle();
  const total = round2(Number(recurring.amount));
  const paidBy = members.some((m) => m.id === recurring.group_paid_by_member_id)
    ? recurring.group_paid_by_member_id
    : members[0].id;

  const { data: expense } = await admin
    .from("group_expenses")
    .insert({
      group_id: recurring.group_id,
      paid_by_member_id: paidBy,
      created_by_member_id: paidBy,
      kind: "recurring",
      merchant: recurring.description,
      expense_date: recurring.next_date,
      currency: recurring.currency ?? group?.base_currency ?? "SGD",
      total,
      category: recurring.group_category ?? "Bills & Utilities",
      parse_status: "manual",
    })
    .select("id")
    .single();
  if (!expense) return null;

  const { data: item } = await admin
    .from("group_expense_items")
    .insert({
      expense_id: expense.id,
      group_id: recurring.group_id,
      name: recurring.description ?? "Recurring expense",
      quantity: 1,
      unit_price: total,
      line_total: total,
      split_method: "equal",
    })
    .select("id")
    .single();
  if (item) {
    const [shares] = computeAssignmentAmounts(
      [{ lineTotal: total, splitMethod: "equal", assignments: members.map((m) => ({ memberId: m.id, share: 1 })) }],
      total,
    );
    await admin.from("item_assignments").insert(
      members.map((m) => ({
        item_id: item.id,
        member_id: m.id,
        group_id: recurring.group_id,
        share: 1,
        amount: shares.get(m.id) ?? 0,
      })),
    );
  }

  const next = advanceDate(recurring.next_date, recurring.frequency, recurring.frequency_interval || 1);
  const finished = recurring.end_date != null && next > recurring.end_date;
  await admin
    .from("scheduled_transactions")
    .update({ next_date: next, is_active: finished ? false : recurring.is_active })
    .eq("id", recurring.id);

  await logActivity(admin, recurring.group_id, null, "RECURRING_POSTED", {
    receiptId: expense.id,
    name: recurring.description,
  });
  return expense.id as string;
}
