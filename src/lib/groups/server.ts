import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthUserId } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  groupAccessCookieName,
  isValidGroupAccessToken,
  normalizeGroupCode,
} from "@/lib/groups/security";
import type {
  GroupExpense,
  GroupExpenseItem,
  GroupFxRate,
  GroupMember,
  GroupPayment,
  ItemAssignment,
  SplitGroup,
} from "@/lib/groups/types";
import type { BalanceOptions, LedgerExpense, LedgerPayment, Rates } from "@/lib/splitting";

export type GroupContext = {
  admin: SupabaseClient;
  authUserId: string | null;
  group: SplitGroup;
  /** Every member row, including removed ones, for rendering history. */
  allMembers: GroupMember[];
  /** Members who are still in the group (not removed, not banned). */
  members: GroupMember[];
  me: GroupMember | null;
  isAdmin: boolean;
  isBanned: boolean;
  /** Whether a non-member may see the read-only guest view. */
  canView: boolean;
};

export const GROUP_COLUMNS =
  "id, code, name, description, base_currency, password_hash, simplify_debts, convert_balances, reminders_enabled, reminder_days, status, created_by, created_at";
export const MEMBER_COLUMNS =
  "id, group_id, user_id, nickname, role, banned, removed_at, sync_to_budget, created_at";

export async function getGroupContext(rawCode: string): Promise<GroupContext | null> {
  const code = normalizeGroupCode(rawCode);
  const admin = createServiceClient();
  const authUserId = await getAuthUserId();

  const { data: group } = await admin
    .from("split_groups")
    .select(GROUP_COLUMNS)
    .eq("code", code)
    .maybeSingle();
  if (!group) return null;

  const { data: memberRows } = await admin
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", group.id)
    .order("created_at", { ascending: true });

  const allMembers = (memberRows ?? []) as GroupMember[];
  const members = allMembers.filter((m) => !m.removed_at && !m.banned);
  const mine = authUserId ? allMembers.find((m) => m.user_id === authUserId) ?? null : null;
  const isBanned = Boolean(mine?.banned);
  const me = mine && !mine.banned && !mine.removed_at ? mine : null;

  let canView = Boolean(me) || !group.password_hash;
  if (!canView && group.password_hash) {
    const token = (await cookies()).get(groupAccessCookieName(group.code))?.value;
    canView = isValidGroupAccessToken(group.code, group.password_hash, token);
  }

  return {
    admin,
    authUserId,
    group: group as SplitGroup,
    allMembers,
    members,
    me,
    isAdmin: me?.role === "admin",
    isBanned,
    canView,
  };
}

export type MemberContext = GroupContext & { me: GroupMember; authUserId: string };

/** For server actions: the caller must be signed in and an active member. */
export async function requireGroupMember(
  rawCode: string,
  options: { admin?: boolean } = {},
): Promise<MemberContext> {
  const code = normalizeGroupCode(rawCode);
  const context = await getGroupContext(code);
  if (!context) redirect("/groups?error=Group%20not%20found.");
  if (!context.authUserId) redirect(`/login?next=${encodeURIComponent(`/groups/${code}`)}`);
  if (!context.me) redirect(`/groups/${code}?error=${encodeURIComponent("Join the group first.")}`);
  if (options.admin && !context.isAdmin) {
    redirect(`/groups/${code}?error=${encodeURIComponent("Only group admins can do that.")}`);
  }
  return context as MemberContext;
}

export function memberName(members: GroupMember[], id: string | null | undefined) {
  if (!id) return "Unknown";
  return members.find((m) => m.id === id)?.nickname ?? "Former member";
}

export async function logActivity(
  admin: SupabaseClient,
  groupId: string,
  actor: GroupMember | null,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  await admin.from("group_activity").insert({
    group_id: groupId,
    member_id: actor?.id ?? null,
    actor_name: actor?.nickname ?? "System",
    action,
    metadata,
  });
}

/** PostgREST caps responses at 1000 rows; page through larger groups. */
async function selectAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export const EXPENSE_COLUMNS =
  "id, group_id, paid_by_member_id, created_by_member_id, kind, merchant, expense_date, receipt_number, currency, service_charge_percent, tax_percent, discount, total, category, receipt_path, receipt_content_type, content_hash, parse_status, parse_attempts, next_parse_at, parse_note, created_at";
export const ITEM_COLUMNS =
  "id, expense_id, group_id, paid_by_member_id, name, quantity, unit_price, line_total, category, split_method, dispute_status, dispute_reason, disputed_by_member_id, disputed_at, resolved_at, sort_order";
export const PAYMENT_COLUMNS =
  "id, group_id, payer_member_id, receiver_member_id, amount, currency, status, note, proof_path, recorded_by_member_id, approved_by_member_id, resolved_at, created_at";

export type GroupData = {
  expenses: GroupExpense[];
  items: GroupExpenseItem[];
  assignments: ItemAssignment[];
  payments: GroupPayment[];
  rates: GroupFxRate[];
  ledgerExpenses: LedgerExpense[];
  ledgerPayments: LedgerPayment[];
  options: BalanceOptions;
};

function num(value: unknown): number {
  return Number(value ?? 0);
}

export async function loadGroupData(admin: SupabaseClient, group: SplitGroup): Promise<GroupData> {
  const [expenses, items, assignments, payments, rateRows] = await Promise.all([
    selectAll<GroupExpense>((from, to) =>
      admin
        .from("group_expenses")
        .select(EXPENSE_COLUMNS)
        .eq("group_id", group.id)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    selectAll<GroupExpenseItem>((from, to) =>
      admin
        .from("group_expense_items")
        .select(ITEM_COLUMNS)
        .eq("group_id", group.id)
        .order("sort_order", { ascending: true })
        .range(from, to),
    ),
    selectAll<ItemAssignment>((from, to) =>
      admin
        .from("item_assignments")
        .select("item_id, member_id, group_id, share, amount")
        .eq("group_id", group.id)
        .range(from, to),
    ),
    selectAll<GroupPayment>((from, to) =>
      admin
        .from("group_payments")
        .select(PAYMENT_COLUMNS)
        .eq("group_id", group.id)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    selectAll<GroupFxRate>((from, to) =>
      admin
        .from("group_fx_rates")
        .select("group_id, currency, rate_to_base, locked_at")
        .eq("group_id", group.id)
        .range(from, to),
    ),
  ]);

  for (const e of expenses) {
    e.total = num(e.total);
    e.discount = num(e.discount);
    e.service_charge_percent = e.service_charge_percent == null ? null : num(e.service_charge_percent);
    e.tax_percent = e.tax_percent == null ? null : num(e.tax_percent);
  }
  for (const i of items) {
    i.quantity = num(i.quantity);
    i.unit_price = num(i.unit_price);
    i.line_total = num(i.line_total);
  }
  for (const a of assignments) {
    a.share = num(a.share);
    a.amount = num(a.amount);
  }
  for (const p of payments) p.amount = num(p.amount);

  const rates: Rates = {};
  for (const r of rateRows) rates[r.currency] = num(r.rate_to_base);

  const assignmentsByItem = new Map<string, ItemAssignment[]>();
  for (const a of assignments) {
    const list = assignmentsByItem.get(a.item_id) ?? [];
    list.push(a);
    assignmentsByItem.set(a.item_id, list);
  }
  const itemsByExpense = new Map<string, GroupExpenseItem[]>();
  for (const i of items) {
    const list = itemsByExpense.get(i.expense_id) ?? [];
    list.push(i);
    itemsByExpense.set(i.expense_id, list);
  }

  const ledgerExpenses: LedgerExpense[] = expenses
    .filter((e) => e.parse_status !== "pending_ocr" && e.parse_status !== "processing")
    .map((e) => ({
      id: e.id,
      date: e.expense_date,
      currency: e.currency,
      total: e.total,
      merchant: e.merchant,
      category: e.category,
      paidByMemberId: e.paid_by_member_id,
      items: (itemsByExpense.get(e.id) ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        paidByMemberId: i.paid_by_member_id,
        category: i.category,
        lineTotal: i.line_total,
        assignments: (assignmentsByItem.get(i.id) ?? []).map((a) => ({
          memberId: a.member_id,
          amount: a.amount,
        })),
      })),
    }));

  const ledgerPayments: LedgerPayment[] = payments.map((p) => ({
    id: p.id,
    payerMemberId: p.payer_member_id,
    receiverMemberId: p.receiver_member_id,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    createdAt: p.created_at,
  }));

  return {
    expenses,
    items,
    assignments,
    payments,
    rates: rateRows,
    ledgerExpenses,
    ledgerPayments,
    options: {
      baseCurrency: group.base_currency,
      rates,
      convert: group.convert_balances,
    },
  };
}

export function groupPath(code: string, suffix = "") {
  return `/groups/${code}${suffix}`;
}

export function withError(path: string, message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}error=${encodeURIComponent(message)}`;
}

export function withNotice(path: string, message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}notice=${encodeURIComponent(message)}`;
}
