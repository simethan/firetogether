import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/shortcut/copy-button";
import { Banners, BalanceText, TabLink } from "@/components/groups/shared";
import { scheduleGroupSync } from "@/lib/groups/bridge";
import { processDueReceipts } from "@/lib/groups/receipts";
import { getGroupContext, groupPath, loadGroupData } from "@/lib/groups/server";
import { normalizeGroupCode } from "@/lib/groups/security";
import { getSiteUrl } from "@/lib/siteUrl";
import { computeBalances } from "@/lib/splitting";
import { verifyGroupPasswordAction } from "../actions";
import { ActivityTab } from "./_tabs/activity-tab";
import { BalancesTab } from "./_tabs/balances-tab";
import { ExpensesTab } from "./_tabs/expenses-tab";
import { InsightsTab } from "./_tabs/insights-tab";
import { SettingsTab } from "./_tabs/settings-tab";

const MEMBER_TABS = ["expenses", "balances", "activity", "insights", "settings"] as const;
const GUEST_TABS = ["expenses", "balances"] as const;
type Tab = (typeof MEMBER_TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  expenses: "Expenses",
  balances: "Balances",
  activity: "Activity",
  insights: "Insights",
  settings: "Settings",
};

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string; error?: string; notice?: string; member?: string; q?: string; category?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const normalized = normalizeGroupCode(code);
  if (normalized !== code) redirect(groupPath(normalized));

  const context = await getGroupContext(normalized);
  if (!context) notFound();
  const { group, me, canView, isBanned, authUserId } = context;

  if (!canView) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-5 px-4 py-12">
        <Banners error={sp.error} />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">{group.name}</CardTitle>
            <CardDescription>Enter the access password to view this group.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={verifyGroupPasswordAction} className="flex gap-2">
              <input type="hidden" name="code" value={group.code} />
              <Input name="password" type="password" placeholder="Password" required autoFocus />
              <Button type="submit">Unlock</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (me) {
    const { admin } = context;
    after(() => processDueReceipts(admin, group.id));
    if (me.sync_to_budget) {
      const { count } = await admin
        .from("net_worth_accounts")
        .select("id", { count: "exact", head: true })
        .eq("group_member_id", me.id);
      if (!count) scheduleGroupSync(admin, group.id);
    }
  }

  const tabs: readonly Tab[] = me ? MEMBER_TABS : GUEST_TABS;
  const tab: Tab = (tabs as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "expenses";
  const data = await loadGroupData(context.admin, group);
  const balances = computeBalances(data.ledgerExpenses, data.ledgerPayments, data.options);
  const shareUrl = `${getSiteUrl()}/groups/${group.code}`;

  const tabHref = (t: Tab) => (t === "expenses" ? groupPath(group.code) : groupPath(group.code, `?tab=${t}`));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 sm:p-7 lg:p-8">
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="w-fit border-primary/20 bg-primary/10 text-primary">
                Group · {group.code}
              </Badge>
              {group.status === "archived" ? <Badge variant="outline">Archived</Badge> : null}
              {group.password_hash ? <Badge variant="outline">Password protected</Badge> : null}
            </div>
            <div>
              <Link
                href="/groups"
                className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground hover:text-foreground"
              >
                ← Groups
              </Link>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{group.name}</h1>
            </div>
            {group.description ? (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{group.description}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <CopyButton text={shareUrl} label="Copy invite link" copiedLabel="Link copied" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">{me ? "Your balance" : "People"}</div>
              <div className="mt-1 text-2xl">
                {me ? (
                  Object.entries(balances).some(([, perMember]) => Math.abs(perMember[me.id] ?? 0) > 0.005) ? (
                    Object.entries(balances)
                      .filter(([, perMember]) => Math.abs(perMember[me.id] ?? 0) > 0.005)
                      .map(([currency, perMember]) => (
                        <div key={currency}>
                          <BalanceText amount={perMember[me.id]} currency={currency} />
                        </div>
                      ))
                  ) : (
                    <span className="font-semibold text-muted-foreground">Settled up</span>
                  )
                ) : (
                  <span className="font-semibold tabular-nums">{context.members.length}</span>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Expenses</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{data.expenses.length}</div>
            </div>
          </div>
        </div>
      </section>

      <Banners error={sp.error} notice={sp.notice} />

      {!me ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-foreground">
            {isBanned
              ? "You've been removed from this group."
              : authUserId
                ? "You're viewing as a guest. Join to upload receipts, add expenses, and settle up."
                : "You're viewing as a guest. Sign in and claim your name to split items."}
          </span>
          {!isBanned ? (
            <Link
              href={authUserId ? groupPath(group.code, "/join") : `/login?next=${encodeURIComponent(groupPath(group.code, "/join"))}`}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {authUserId ? "Join group" : "Sign in to join"}
            </Link>
          ) : null}
        </div>
      ) : null}

      <nav aria-label="Group sections" className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <TabLink key={t} href={tabHref(t)} active={t === tab}>
            {TAB_LABELS[t]}
          </TabLink>
        ))}
      </nav>

      {tab === "expenses" ? (
        <ExpensesTab context={context} data={data} query={sp.q} category={sp.category} />
      ) : null}
      {tab === "balances" ? <BalancesTab context={context} data={data} selectedMemberId={sp.member} /> : null}
      {tab === "activity" && me ? <ActivityTab context={context} /> : null}
      {tab === "insights" && me ? <InsightsTab context={context} data={data} /> : null}
      {tab === "settings" && me ? <SettingsTab context={context} data={data} /> : null}
    </div>
  );
}
