import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BalanceText, Banners, EmptyState, formatMoney, selectClass } from "@/components/groups/shared";
import { getAuthUserId } from "@/lib/auth";
import { GROUP_COLUMNS, loadGroupData, memberName, MEMBER_COLUMNS } from "@/lib/groups/server";
import { SUPPORTED_CURRENCIES, type GroupMember, type SplitGroup } from "@/lib/groups/types";
import { computeBalances, settlementPlan } from "@/lib/splitting";
import { createServiceClient } from "@/lib/supabase/admin";
import { createGroupAction, goToGroupAction } from "./actions";

type GroupSummary = {
  group: SplitGroup;
  me: GroupMember;
  members: GroupMember[];
  balances: Record<string, number>;
  owedToMe: { from: string; amount: number; currency: string }[];
  iOwe: { to: string; amount: number; currency: string }[];
  remind: boolean;
};

/** Remind people who owe money and haven't paid anything in the last `reminder_days`. */
function isReminderDue(group: SplitGroup, lastPaymentAt: string | null) {
  if (!group.reminders_enabled) return false;
  if (!lastPaymentAt) return true;
  return new Date(lastPaymentAt).getTime() < Date.now() - group.reminder_days * 86_400_000;
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const authUserId = await getAuthUserId();
  if (!authUserId) redirect("/login?next=/groups");

  const admin = createServiceClient();
  const { data: memberships } = await admin
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", authUserId)
    .is("removed_at", null)
    .eq("banned", false);

  const myMemberships = (memberships ?? []) as GroupMember[];
  const groupIds = myMemberships.map((m) => m.group_id);

  const [{ data: groupRows }, { data: memberRows }] = groupIds.length
    ? await Promise.all([
        admin.from("split_groups").select(GROUP_COLUMNS).in("id", groupIds),
        admin.from("group_members").select(MEMBER_COLUMNS).in("group_id", groupIds),
      ])
    : [{ data: [] }, { data: [] }];

  const summaries: GroupSummary[] = await Promise.all(
    ((groupRows ?? []) as SplitGroup[]).map(async (group) => {
      const me = myMemberships.find((m) => m.group_id === group.id)!;
      const members = ((memberRows ?? []) as GroupMember[]).filter((m) => m.group_id === group.id);
      const data = await loadGroupData(admin, group);
      const balances = computeBalances(data.ledgerExpenses, data.ledgerPayments, data.options);
      const mine: Record<string, number> = {};
      for (const [currency, perMember] of Object.entries(balances)) {
        if (Math.abs(perMember[me.id] ?? 0) > 0.005) mine[currency] = perMember[me.id];
      }
      const plan = settlementPlan(data.ledgerExpenses, data.ledgerPayments, {
        ...data.options,
        simplify: group.simplify_debts,
      });
      const owedToMe = plan.filter((t) => t.to === me.id).map((t) => ({ from: t.from, amount: t.amount, currency: t.currency }));
      const iOwe = plan.filter((t) => t.from === me.id).map((t) => ({ to: t.to, amount: t.amount, currency: t.currency }));

      const lastPayment = data.payments.find((p) => p.payer_member_id === me.id && p.status !== "rejected");
      const remind = iOwe.length > 0 && isReminderDue(group, lastPayment?.created_at ?? null);

      return { group, me, members, balances: mine, owedToMe, iOwe, remind };
    }),
  );

  summaries.sort((a, b) => b.group.created_at.localeCompare(a.group.created_at));
  const reminders = summaries.filter((s) => s.remind);
  const owedToMe = summaries.flatMap((s) => s.owedToMe.map((t) => ({ ...t, summary: s })));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 sm:p-7 lg:p-8">
        <div className="space-y-4">
          <Badge variant="secondary" className="w-fit border-primary/20 bg-primary/10 text-primary">
            Split groups
          </Badge>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Trips, houses, crews</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">Groups</h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Snap a receipt, split it item by item, and see exactly who owes who. Your share lands in your budget
            automatically.
          </p>
        </div>
      </section>

      <Banners error={error} notice={notice} />

      {reminders.map((s) => (
        <div
          key={s.group.id}
          className="rounded-2xl border border-amber-300/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
        >
          Reminder: you still owe{" "}
          {s.iOwe.map((t, i) => (
            <span key={`${t.to}-${t.currency}`}>
              {i > 0 ? ", " : ""}
              {formatMoney(t.amount, t.currency)} to {memberName(s.members, t.to)}
            </span>
          ))}{" "}
          in{" "}
          <Link href={`/groups/${s.group.code}?tab=balances`} className="font-medium underline underline-offset-4">
            {s.group.name}
          </Link>
          .
        </div>
      ))}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Your groups</CardTitle>
              <CardDescription>Balances in each group&apos;s currency. Positive means you&apos;re owed.</CardDescription>
            </CardHeader>
            <CardContent>
              {summaries.length ? (
                <div className="space-y-2">
                  {summaries.map((s) => (
                    <Link
                      key={s.group.id}
                      href={`/groups/${s.group.code}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <span className="truncate">{s.group.name}</span>
                          {s.group.status === "archived" ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              Archived
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {s.members.filter((m) => !m.removed_at && !m.banned).length} people · code {s.group.code}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        {Object.keys(s.balances).length ? (
                          Object.entries(s.balances).map(([currency, amount]) => (
                            <div key={currency}>
                              <BalanceText amount={amount} currency={currency} />
                            </div>
                          ))
                        ) : (
                          <span className="text-muted-foreground">All settled up</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState>No groups yet. Create one or join with a code.</EmptyState>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Who owes you</CardTitle>
              <CardDescription>Across every group, based on each group&apos;s settlement plan.</CardDescription>
            </CardHeader>
            <CardContent>
              {owedToMe.length ? (
                <div className="space-y-2">
                  {owedToMe.map((t) => (
                    <div
                      key={`${t.summary.group.id}-${t.from}-${t.currency}`}
                      className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm"
                    >
                      <span>
                        <span className="font-medium text-foreground">{memberName(t.summary.members, t.from)}</span>{" "}
                        <span className="text-muted-foreground">in {t.summary.group.name}</span>
                      </span>
                      <BalanceText amount={t.amount} currency={t.currency} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>Nobody owes you anything right now.</EmptyState>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Join a group</CardTitle>
              <CardDescription>Enter the code a group member shared with you.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={goToGroupAction} className="flex gap-2">
                <Input name="code" placeholder="AJ7AGT" className="uppercase" required />
                <Button type="submit">Enter group</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">New group</CardTitle>
              <CardDescription>One link per trip, house, or crew.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createGroupAction} className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="We Go Taiwan" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input id="description" name="description" placeholder="Taipei, 5 nights" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="base_currency">Currency</Label>
                    <select id="base_currency" name="base_currency" defaultValue="SGD" className={selectClass}>
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Access password (optional)</Label>
                    <Input id="password" name="password" type="password" autoComplete="new-password" />
                  </div>
                </div>
                <Button type="submit" className="w-full sm:w-fit">
                  Create group
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
