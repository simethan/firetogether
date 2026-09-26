import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, formatDay, formatMoney, selectClass } from "@/components/groups/shared";
import { RECURRING_COLUMNS, type GroupRecurring } from "@/lib/groups/recurring";
import { memberName, type GroupContext, type GroupData } from "@/lib/groups/server";
import { GROUP_CATEGORIES, SUPPORTED_CURRENCIES, type GroupBudget } from "@/lib/groups/types";
import { budgetPeriodStart, spendingInsights } from "@/lib/splitting";
import {
  createGroupRecurringAction,
  deleteGroupBudgetAction,
  deleteGroupRecurringAction,
  postGroupRecurringAction,
  saveGroupBudgetAction,
  toggleGroupRecurringAction,
} from "../extras-actions";

function Bars({ rows, currency }: { rows: [string, number][]; currency: string }) {
  const max = Math.max(...rows.map(([, v]) => v), 0);
  if (!rows.length) return <EmptyState>Add a receipt or manual expense to see totals and category trends.</EmptyState>;
  return (
    <div className="space-y-2.5">
      {rows.map(([label, value]) => (
        <div key={label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{label}</span>
            <span className="tabular-nums text-muted-foreground">{formatMoney(value, currency)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const sortDesc = (record: Record<string, number>) =>
  Object.entries(record)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

export async function InsightsTab({ context, data }: { context: GroupContext; data: GroupData }) {
  const { admin, group, me, isAdmin, members, allMembers } = context;
  if (!me) return null;
  const currency = group.base_currency;
  const options = { baseCurrency: currency, rates: data.options.rates };

  const everyone = spendingInsights(data.ledgerExpenses, options);
  const mine = spendingInsights(data.ledgerExpenses, options, me.id);
  const months = Object.entries(everyone.byMonth).sort((a, b) => a[0].localeCompare(b[0]));

  const [{ data: budgetRows }, { data: recurringRows }] = await Promise.all([
    admin.from("group_budgets").select("id, group_id, category, amount, period, alert_threshold, created_at").eq("group_id", group.id),
    admin.from("scheduled_transactions").select(RECURRING_COLUMNS).eq("group_id", group.id).order("next_date"),
  ]);
  const budgets = (budgetRows ?? []) as GroupBudget[];
  const recurring = (recurringRows ?? []) as GroupRecurring[];

  const today = new Date();
  const budgetStatus = budgets.map((budget) => {
    const start = budgetPeriodStart(budget.period, today);
    const inPeriod = start ? data.ledgerExpenses.filter((e) => e.date >= start) : data.ledgerExpenses;
    const spend = spendingInsights(inPeriod, options);
    const spent = budget.category ? spend.byCategory[budget.category] ?? 0 : spend.totalSpend;
    const pct = (spent / Number(budget.amount)) * 100;
    return { budget, spent, pct };
  });

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Spending</CardTitle>
          <CardDescription>
            {formatMoney(everyone.totalSpend, currency)} in total
            {everyone.unassigned > 0 ? ` · ${formatMoney(everyone.unassigned, currency)} not split yet` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Bars rows={sortDesc(everyone.byCategory)} currency={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">My spending</CardTitle>
          <CardDescription>Your share: {formatMoney(mine.totalSpend, currency)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Bars rows={sortDesc(mine.byCategory)} currency={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">By person</CardTitle>
          <CardDescription>What each person&apos;s share adds up to.</CardDescription>
        </CardHeader>
        <CardContent>
          <Bars
            rows={sortDesc(everyone.byMember).map(([id, v]) => [memberName(allMembers, id), v] as [string, number])}
            currency={currency}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">By month</CardTitle>
        </CardHeader>
        <CardContent>
          {months.length > 1 ? (
            <Bars rows={months} currency={currency} />
          ) : (
            <EmptyState>Add expenses in another month to see your spending trend.</EmptyState>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Spending budgets</CardTitle>
          <CardDescription>Get a heads-up when the group gets close to a limit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {budgetStatus.length ? (
            budgetStatus.map(({ budget, spent, pct }) => (
              <div key={budget.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {budget.category ?? "Everything"} · {budget.period === "total" ? "whole trip" : budget.period}
                    {pct >= 100 ? (
                      <Badge variant="destructive">Over budget!</Badge>
                    ) : pct >= budget.alert_threshold ? (
                      <Badge className="border-amber-200 bg-amber-500/10 text-amber-600">Approaching limit</Badge>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatMoney(spent, currency)} / {formatMoney(Number(budget.amount), currency)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={pct >= 100 ? "h-full bg-destructive" : pct >= budget.alert_threshold ? "h-full bg-amber-500" : "h-full bg-primary"}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                {isAdmin ? (
                  <form action={deleteGroupBudgetAction}>
                    <input type="hidden" name="code" value={group.code} />
                    <input type="hidden" name="budget_id" value={budget.id} />
                    <button type="submit" className="text-xs text-muted-foreground hover:text-destructive">
                      Remove
                    </button>
                  </form>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No budgets yet.</p>
          )}
          {isAdmin ? (
            <form action={saveGroupBudgetAction} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <input type="hidden" name="code" value={group.code} />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="budget-category">Category (optional — leave empty for total budget)</Label>
                <select id="budget-category" name="category" defaultValue="" className={selectClass}>
                  <option value="">Everything</option>
                  {GROUP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-amount">Amount ({currency})</Label>
                <Input id="budget-amount" name="amount" type="number" min="1" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-period">Period</Label>
                <select id="budget-period" name="period" defaultValue="total" className={selectClass}>
                  <option value="total">Whole trip</option>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-alert">Alert at %</Label>
                <Input id="budget-alert" name="alert_threshold" type="number" min="1" max="100" defaultValue={80} />
              </div>
              <div className="flex items-end">
                <Button type="submit">Add budget</Button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Recurring expenses</CardTitle>
          <CardDescription>Rent, utilities, subscriptions — posted automatically and split equally.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recurring.length ? (
            recurring.map((entry) => (
              <div
                key={entry.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 ${
                  entry.is_active ? "bg-muted/20" : "bg-muted/10 opacity-60"
                }`}
              >
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{entry.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry.frequency} · next {formatDay(entry.next_date)} · paid by{" "}
                    {memberName(allMembers, entry.group_paid_by_member_id)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">
                    {formatMoney(Number(entry.amount), entry.currency ?? currency)}
                  </span>
                  {(
                    [
                      [postGroupRecurringAction, "Post now"],
                      [toggleGroupRecurringAction, entry.is_active ? "Pause" : "Resume"],
                      [deleteGroupRecurringAction, "Delete"],
                    ] as const
                  ).map(([action, label]) => (
                    <form key={label} action={action}>
                      <input type="hidden" name="code" value={group.code} />
                      <input type="hidden" name="recurring_id" value={entry.id} />
                      <button type="submit" className="text-xs text-muted-foreground hover:text-primary">
                        {label}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No recurring expenses yet.</p>
          )}
          <form action={createGroupRecurringAction} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <input type="hidden" name="code" value={group.code} />
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="recurring-name">Name</Label>
              <Input id="recurring-name" name="name" placeholder="Rent" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-amount">Amount</Label>
              <Input id="recurring-amount" name="amount" type="number" min="0.01" step="0.01" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-currency">Currency</Label>
              <select id="recurring-currency" name="currency" defaultValue={currency} className={selectClass}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-frequency">Frequency</Label>
              <select id="recurring-frequency" name="frequency" defaultValue="monthly" className={selectClass}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-paid-by">Who pays?</Label>
              <select id="recurring-paid-by" name="paid_by" defaultValue={me.id} className={selectClass}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nickname}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-category">Category</Label>
              <select id="recurring-category" name="category" defaultValue="Bills & Utilities" className={selectClass}>
                {GROUP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-start">Start date</Label>
              <Input
                id="recurring-start"
                name="start_date"
                type="date"
                defaultValue={today.toISOString().slice(0, 10)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-end">End date (optional)</Label>
              <Input id="recurring-end" name="end_date" type="date" />
            </div>
            <div className="flex items-end">
              <Button type="submit">Add recurring</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
