import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchExchangeRates } from "@/lib/fx-rates";
import {
  GROUP_COLUMNS,
  MEMBER_COLUMNS,
  loadGroupData,
  type GroupData,
} from "@/lib/groups/server";
import type { GroupMember, SplitGroup } from "@/lib/groups/types";
import { computeBalances, memberShares, rateFor, round2 } from "@/lib/splitting";

type BridgeUser = { id: string; couple_id: string | null };
type BudgetCategory = { id: string; couple_id: string; name: string };

/** Re-sync a group's budgets after the response is sent. */
export function scheduleGroupSync(admin: SupabaseClient, groupId: string) {
  after(async () => {
    const [{ data: group }, { data: members }] = await Promise.all([
      admin.from("split_groups").select(GROUP_COLUMNS).eq("id", groupId).maybeSingle(),
      admin.from("group_members").select(MEMBER_COLUMNS).eq("group_id", groupId),
    ]);
    if (group) await syncGroupBudgets(admin, group as SplitGroup, (members ?? []) as GroupMember[]);
  });
}

/**
 * Keep every member's budget in step with the group:
 * - v0: one personal expense per group expense for the member's share,
 *   categorised through group_category_map (or a same-name category).
 * - IOU account: a net worth account whose balance is the member's net
 *   group balance, with a snapshot for today.
 *
 * Never throws — a budget sync failure must not break the group action.
 */
export async function syncGroupBudgets(
  admin: SupabaseClient,
  group: SplitGroup,
  members: GroupMember[],
  preloaded?: GroupData,
) {
  try {
    const data = preloaded ?? (await loadGroupData(admin, group));
    const syncing = members.filter((m) => m.user_id && m.sync_to_budget && !m.removed_at && !m.banned);

    const userIds = syncing.map((m) => m.user_id as string);
    const { data: userRows } = userIds.length
      ? await admin.from("users").select("id, couple_id").in("id", userIds)
      : { data: [] as BridgeUser[] };
    const users = new Map((userRows ?? []).map((u: BridgeUser) => [u.id, u]));

    const coupleIds = [...new Set([...users.values()].map((u) => u.couple_id).filter(Boolean))] as string[];
    const [{ data: categoryRows }, { data: mapRows }] = await Promise.all([
      coupleIds.length
        ? admin.from("categories").select("id, couple_id, name").in("couple_id", coupleIds)
        : Promise.resolve({ data: [] as BudgetCategory[] }),
      userIds.length
        ? admin.from("group_category_map").select("user_id, group_category, category_id").in("user_id", userIds)
        : Promise.resolve({ data: [] as { user_id: string; group_category: string; category_id: string }[] }),
    ]);
    const categories = (categoryRows ?? []) as BudgetCategory[];
    const mappings = new Map(
      (mapRows ?? []).map((m: { user_id: string; group_category: string; category_id: string }) => [
        `${m.user_id}\u0000${m.group_category}`,
        m.category_id,
      ]),
    );

    const toSgd = await sgdConverter(group, data);

    const resolveCategory = (user: BridgeUser, groupCategory: string) => {
      const mapped = mappings.get(`${user.id}\u0000${groupCategory}`);
      if (mapped) return mapped;
      const own = categories.filter((c) => c.couple_id === user.couple_id);
      const byName = own.find((c) => c.name.toLowerCase() === groupCategory.toLowerCase());
      return byName?.id ?? own.find((c) => c.name === "Other")?.id ?? null;
    };

    // ---- v0: personal expense rows ----
    const desired: Record<string, unknown>[] = [];
    for (const member of syncing) {
      const user = users.get(member.user_id as string);
      if (!user?.couple_id) continue;
      for (const { expense, amount, byCategory } of memberShares(member.id, data.ledgerExpenses)) {
        const sgd = toSgd(amount, expense.currency);
        if (sgd == null || sgd <= 0) continue;
        const [topCategory] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
        desired.push({
          couple_id: user.couple_id,
          user_id: user.id,
          category_id: resolveCategory(user, topCategory),
          amount: round2(sgd),
          description: `${group.name} · ${expense.merchant || expense.category}`,
          expense_date: expense.date,
          split_type: "personal",
          custom_ratio: null,
          group_expense_id: expense.id,
          group_id: group.id,
        });
      }
    }

    const { data: existing } = await admin
      .from("expenses")
      .select("id, group_expense_id, user_id")
      .eq("group_id", group.id);
    const keep = new Set(desired.map((row) => `${row.group_expense_id}\u0000${row.user_id}`));
    const stale = (existing ?? [])
      .filter((row: { group_expense_id: string; user_id: string }) => !keep.has(`${row.group_expense_id}\u0000${row.user_id}`))
      .map((row: { id: string }) => row.id);

    if (stale.length) await admin.from("expenses").delete().in("id", stale);
    if (desired.length) {
      const { error } = await admin.from("expenses").upsert(desired, { onConflict: "group_expense_id,user_id" });
      if (error) console.error("group bridge: expense upsert failed", error.message);
    }

    // ---- IOU accounts ----
    await syncIouAccounts(admin, group, members, syncing, users, data, toSgd);
  } catch (error) {
    console.error("group bridge: sync failed", error);
  }
}

async function syncIouAccounts(
  admin: SupabaseClient,
  group: SplitGroup,
  allMembers: GroupMember[],
  syncing: GroupMember[],
  users: Map<string, BridgeUser>,
  data: GroupData,
  toSgd: (amount: number, currency: string) => number | null,
) {
  const balances = computeBalances(data.ledgerExpenses, data.ledgerPayments, { ...data.options, convert: true });
  const today = new Date().toISOString().slice(0, 10);

  const syncingIds = new Set(syncing.map((m) => m.id));
  const dropped = allMembers.filter((m) => !syncingIds.has(m.id)).map((m) => m.id);
  if (dropped.length) {
    await admin.from("net_worth_accounts").delete().in("group_member_id", dropped);
  }

  for (const member of syncing) {
    const user = users.get(member.user_id as string);
    if (!user?.couple_id) continue;

    let sgdBalance = 0;
    let convertible = true;
    for (const [currency, perMember] of Object.entries(balances)) {
      const value = toSgd(perMember[member.id] ?? 0, currency);
      if (value == null) convertible = false;
      else sgdBalance += value;
    }
    if (!convertible) continue;
    sgdBalance = round2(sgdBalance);

    const { data: account } = await admin
      .from("net_worth_accounts")
      .upsert(
        {
          couple_id: user.couple_id,
          group_member_id: member.id,
          name: `${group.name} (${member.nickname})`,
          type: "IOU",
          account_category: "bank",
          bank_name: "Group IOU",
          currency: "SGD",
          include_in_net_worth: true,
        },
        { onConflict: "group_member_id" },
      )
      .select("id")
      .single();
    if (!account) continue;

    const { data: latest } = await admin
      .from("account_balance_history")
      .select("id, balance, recorded_at")
      .eq("account_id", account.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest && latest.recorded_at === today) {
      if (Number(latest.balance) !== sgdBalance) {
        await admin.from("account_balance_history").update({ balance: sgdBalance }).eq("id", latest.id);
      }
    } else if (!latest || Number(latest.balance) !== sgdBalance) {
      await admin.from("account_balance_history").insert({
        account_id: account.id,
        balance: sgdBalance,
        recorded_at: today,
        notes: "Synced from group balance",
      });
    }
  }
}

/** Amount in any group currency → SGD: the group's locked rates first, then live rates. */
async function sgdConverter(group: SplitGroup, data: GroupData) {
  const currencies = new Set<string>([group.base_currency, ...data.ledgerExpenses.map((e) => e.currency)]);
  const live = await fetchExchangeRates([...currencies]);
  const baseToSgd = group.base_currency === "SGD" ? 1 : live.get(group.base_currency) ?? null;

  return (amount: number, currency: string): number | null => {
    if (amount === 0) return 0;
    if (currency === "SGD") return amount;
    const toBase = rateFor(currency, data.options);
    if (toBase != null && baseToSgd != null) return amount * toBase * baseToSgd;
    const direct = live.get(currency);
    return direct ? amount * direct : null;
  };
}
