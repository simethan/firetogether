import { redirect } from "next/navigation";
import Link from "next/link";

import { CategoryIcon } from "@/components/categories/category-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import {
  computeEnvelopeStatuses,
  computeReadyToAssign,
  computeTotalIncome,
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthValue,
  getMonthStartDate,
  getNextMonthEnd,
  getUserShareForExpense,
} from "@/lib/finance";
import type { Budget, Category, Expense, Income } from "@/lib/types";
import {
  createBudgetAction,
  coverOverspendingAction,
  deleteBudgetAction,
  fundEnvelopeAction,
  moveMoneyAction,
  updateBudgetAction,
} from "./actions";

function ErrorBanner({ searchParams }: { searchParams: { error?: string } }) {
  if (!searchParams.error) return null;
  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {decodeURIComponent(searchParams.error)}
    </div>
  );
}

function EnvelopeStatusBadge({ status }: { status: string }) {
  if (status === "funded") {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
        Funded
      </Badge>
    );
  }
  if (status === "overdrawn") {
    return <Badge variant="destructive">Overdrawn</Badge>;
  }
  if (status === "underfunded") {
    return (
      <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">
        Underfunded
      </Badge>
    );
  }
  return <Badge variant="secondary">On track</Badge>;
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const authUserId = await getAuthUserId();

  if (!authUserId) redirect("/login");

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) redirect("/onboarding");

  const currentMonth = getCurrentMonthValue();
  const monthLabel = formatMonthLabel(currentMonth);
  const currentMonthStart = `${currentMonth}-01`;
  const monthEnd = getNextMonthEnd(currentMonth);

  const [{ data: categories }, { data: budgets }, { data: expenses }, { data: income }] =
    await Promise.all([
      admin
        .from("categories")
        .select("id, couple_id, name, icon, is_default, created_at")
        .eq("couple_id", currentUser.couple_id)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true }),
      admin
        .from("budgets")
        .select("id, couple_id, category_id, month, amount, funded_amount, is_shared")
        .eq("couple_id", currentUser.couple_id)
        .eq("month", currentMonthStart)
        .order("amount", { ascending: false }),
      admin
        .from("expenses")
        .select(
          "id, couple_id, user_id, category_id, amount, description, split_type, custom_ratio, created_at",
        )
        .eq("couple_id", currentUser.couple_id)
        .gte("expense_date", currentMonthStart)
        .lt("expense_date", monthEnd),
      admin
        .from("income")
        .select("id, couple_id, user_id, amount, source, income_date, created_at")
        .eq("couple_id", currentUser.couple_id)
        .gte("income_date", currentMonthStart)
        .lt("income_date", monthEnd),
    ]);

  const typedCategories = (categories ?? []) as Category[];
  const typedBudgets = (budgets ?? []) as Budget[];
  const typedExpenses = (expenses ?? []) as Expense[];
  const typedIncome = (income ?? []) as Income[];

  const totalIncome = computeTotalIncome(typedIncome);
  const totalFunded = typedBudgets.reduce(
    (sum, b) => sum + (Number(b.funded_amount) || 0),
    0,
  );
  const readyToAssign = computeReadyToAssign(totalIncome, totalFunded);

  const envelopes = computeEnvelopeStatuses(typedBudgets, typedExpenses, typedCategories, currentUser.id);
  const overdrawnCount = envelopes.filter((e) => e.status === "overdrawn").length;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 sm:p-7 lg:p-8">
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-4">
            <Badge variant="secondary" className="w-fit border-primary/20 bg-primary/10 text-primary">
              Envelope budgeting
            </Badge>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">{monthLabel}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">Ready to assign</h1>
              <div className="mt-2 text-4xl font-semibold tabular-nums text-foreground sm:text-5xl">
                {formatCurrency(readyToAssign)}
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Give every dollar a job. Fund your envelopes from available income, then track spending against what you have set aside.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Income</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(totalIncome)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Funded</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(totalFunded)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Envelopes</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {envelopes.length}
                {overdrawnCount > 0 ? <span className="ml-2 text-sm font-normal text-destructive">· {overdrawnCount} overdrawn</span> : null}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Spent</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatCurrency(typedExpenses.reduce((sum, e) => sum + getUserShareForExpense(e, currentUser.id), 0))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {overdrawnCount > 0 ? (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{overdrawnCount} envelope{overdrawnCount === 1 ? "" : "s"} overdrawn — cover overspending to stay on track.</span>
        </div>
      ) : null}

      <ErrorBanner searchParams={resolvedSearchParams} />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="grid gap-5 content-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Create envelope</CardTitle>
              <CardDescription>Set a target for a category or overall spending.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createBudgetAction} className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category_id">Category</Label>
                  <select id="category_id" name="category_id" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" defaultValue="">
                    <option value="">Overall budget</option>
                    {typedCategories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
                <fieldset className="space-y-2">
                  <Label>Tracking</Label>
                  <div className="flex gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <input type="radio" name="is_shared" value="true" defaultChecked className="accent-primary" />
                      <span className="font-medium">Shared</span>
                      <span className="text-muted-foreground">tracks couple-wide spending</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <input type="radio" name="is_shared" value="false" className="accent-primary" />
                      <span className="font-medium">Individual</span>
                      <span className="text-muted-foreground">tracks your share only</span>
                    </label>
                  </div>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Target amount</Label>
                    <Input id="amount" name="amount" type="number" min="0.01" step="0.01" placeholder="500" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="month">Month</Label>
                    <Input id="month" name="month" type="month" defaultValue={currentMonth} required />
                  </div>
                </div>
                <Button type="submit" className="w-full sm:w-fit">Create envelope</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Fund envelope</CardTitle>
              <CardDescription>Put money into an envelope from Ready to Assign.</CardDescription>
            </CardHeader>
            <CardContent>
              {envelopes.length > 0 ? (
                <form action={fundEnvelopeAction} className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fund_id">Envelope</Label>
                    <select id="fund_id" name="id" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" defaultValue="">
                      <option value="">Choose an envelope</option>
                      {envelopes.map((env) => (
                        <option key={env.budgetId} value={env.budgetId}>
                          {env.categoryName} ({formatCurrency(env.funded)} funded)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fund_amount">Amount to fund</Label>
                    <Input id="fund_amount" name="amount" type="number" min="0.01" step="0.01" placeholder="100" required />
                  </div>
                  <Button type="submit" className="w-full sm:w-fit" disabled={readyToAssign <= 0}>
                    {readyToAssign > 0 ? `Fund from ${formatCurrency(readyToAssign)}` : "No funds to assign"}
                  </Button>
                </form>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Create an envelope first, then fund it here.
                </div>
              )}
            </CardContent>
          </Card>

          {envelopes.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Move money</CardTitle>
                <CardDescription>Transfer funded amounts between envelopes.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={moveMoneyAction} className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="from_id">From</Label>
                    <select id="from_id" name="from_id" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" defaultValue="">
                      <option value="">Source envelope</option>
                      {envelopes.filter((e) => e.funded > 0).map((env) => (
                        <option key={env.budgetId} value={env.budgetId}>
                          {env.categoryName} ({formatCurrency(env.funded)} funded)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="to_id">To</Label>
                    <select id="to_id" name="to_id" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" defaultValue="">
                      <option value="">Target envelope</option>
                      {envelopes.map((env) => (
                        <option key={env.budgetId} value={env.budgetId}>
                          {env.categoryName} ({formatCurrency(env.funded)} funded)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="move_amount">Amount</Label>
                    <Input id="move_amount" name="amount" type="number" min="0.01" step="0.01" placeholder="50" required />
                  </div>
                  <Button type="submit" className="w-full sm:w-fit">Move</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {overdrawnCount > 0 && envelopes.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Cover overspending</CardTitle>
                <CardDescription>Move money to cover an overdrawn envelope.</CardDescription>
              </CardHeader>
              <CardContent>
                <form action={coverOverspendingAction} className="grid gap-4">
                  <input type="hidden" name="overdrawn_id" value={envelopes.filter((e) => e.status === "overdrawn")[0]?.budgetId ?? ""} />
                  <div className="space-y-2">
                    <Label htmlFor="cover_from">Source envelope</Label>
                    <select id="cover_from" name="from_id" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" defaultValue="">
                      <option value="">Choose a source</option>
                      {envelopes.filter((e) => e.funded > e.spent).map((env) => (
                        <option key={env.budgetId} value={env.budgetId}>
                          {env.categoryName} ({formatCurrency(env.funded - env.spent)} available)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cover_amount">Amount to cover</Label>
                    <Input id="cover_amount" name="amount" type="number" min="0.01" step="0.01" placeholder={String(envelopes.filter((e) => e.status === "overdrawn").reduce((s, e) => s + Math.abs(e.remaining), 0))} required />
                  </div>
                  <Button type="submit" className="w-full sm:w-fit">Cover</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold">Envelopes</CardTitle>
                <CardDescription>Funded amounts and remaining balances for {monthLabel}.</CardDescription>
              </div>
              <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/income">Add income →</Link>
            </div>
          </CardHeader>
          <CardContent>
            {envelopes.length > 0 ? (
              <div className="space-y-3">
                {envelopes.map((envelope) => {
                  const fundedPercent = envelope.target > 0 ? Math.min(100, Math.round((envelope.funded / envelope.target) * 100)) : 0;
                  const spentPercent = envelope.funded > 0 ? Math.min(100, Math.round((envelope.spent / envelope.funded) * 100)) : 0;

                  return (
                    <div key={envelope.budgetId} className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                        <div className="min-w-0 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 font-semibold text-foreground">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                  <CategoryIcon icon={envelope.categoryIcon} />
                                </span>
                                <span className="truncate">{envelope.categoryName}</span>
                                {envelope.isShared ? (
                                  <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">Shared</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">Individual</Badge>
                                )}
                              </div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {formatCurrency(envelope.spent)} spent of {formatCurrency(envelope.funded)} funded
                                {envelope.target > 0 ? ` · ${formatCurrency(envelope.target)} target` : ""}
                              </div>
                            </div>
                            <EnvelopeStatusBadge status={envelope.status} />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Funded</span>
                              <span>{fundedPercent}%</span>
                            </div>
                            <Progress value={fundedPercent} className={fundedPercent < 100 && envelope.target > 0 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"} />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Spent</span>
                              <span>{spentPercent}%</span>
                            </div>
                            <Progress value={spentPercent} className={envelope.status === "overdrawn" ? "[&>div]:bg-destructive" : ""} />
                          </div>

                          <div className="grid grid-cols-3 gap-3 text-sm">
                            <div className="rounded-xl border border-border bg-background/60 p-3">
                              <div className="text-muted-foreground">Funded</div>
                              <div className="font-semibold tabular-nums">{formatCurrency(envelope.funded)}</div>
                            </div>
                            <div className="rounded-xl border border-border bg-background/60 p-3">
                              <div className="text-muted-foreground">Left</div>
                              <div className={envelope.remaining < 0 ? "font-semibold tabular-nums text-destructive" : "font-semibold tabular-nums"}>
                                {envelope.remaining < 0 ? `-${formatCurrency(Math.abs(envelope.remaining))}` : formatCurrency(envelope.remaining)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-border bg-background/60 p-3">
                              <div className="text-muted-foreground">Target</div>
                              <div className="font-semibold tabular-nums">{envelope.target > 0 ? formatCurrency(envelope.target) : "—"}</div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] lg:min-w-64 lg:grid-cols-1">
                          <form action={fundEnvelopeAction} className="flex gap-2">
                            <input type="hidden" name="id" value={envelope.budgetId} />
                            <Input name="amount" type="number" min="0.01" step="0.01" placeholder="Fund amount" aria-label="Fund amount" />
                            <Button type="submit" variant="outline" disabled={readyToAssign <= 0}>
                              Fund
                            </Button>
                          </form>
                          <form action={updateBudgetAction} className="flex gap-2">
                            <input type="hidden" name="id" value={envelope.budgetId} />
                            <Input name="amount" type="number" min="0.01" step="0.01" defaultValue={envelope.target} aria-label="Budget target" />
                            <Button type="submit" variant="outline">Target</Button>
                          </form>
                          <form action={deleteBudgetAction}>
                            <input type="hidden" name="id" value={envelope.budgetId} />
                            <Button type="submit" variant="destructive" className="w-full">Delete</Button>
                          </form>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 py-10 text-center">
                <span className="text-4xl">🧧</span>
                <p className="text-sm text-muted-foreground">No envelopes set for this month yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
