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
import { formatCurrency, getCurrentMonthValue } from "@/lib/finance";
import type { Budget, Category, Expense } from "@/lib/types";
import {
  createBudgetAction,
  deleteBudgetAction,
  updateBudgetAction,
} from "./actions";

function ErrorBanner({ searchParams }: { searchParams: { error?: string } }) {
  if (!searchParams.error) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {decodeURIComponent(searchParams.error)}
    </div>
  );
}

function formatMonthLabel(monthValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthValue}-01T00:00:00`));
}

function getProgress(spent: number, budget: number) {
  if (budget <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((spent / budget) * 100));
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) {
    redirect("/onboarding");
  }

  const currentMonth = getCurrentMonthValue();
  const monthLabel = formatMonthLabel(currentMonth);
  const currentMonthStart = `${currentMonth}-01`;

  const [{ data: categories }, { data: budgets }, { data: expenses }] =
    await Promise.all([
      admin
        .from("categories")
        .select("id, couple_id, name, icon, is_default, created_at")
        .eq("couple_id", currentUser.couple_id)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true }),
      admin
        .from("budgets")
        .select("id, couple_id, category_id, month, amount")
        .eq("couple_id", currentUser.couple_id)
        .eq("month", currentMonthStart)
        .order("amount", { ascending: false }),
      admin
        .from("expenses")
        .select(
          "id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at",
        )
        .eq("couple_id", currentUser.couple_id)
        .eq("user_id", currentUser.id)
        .gte("expense_date", currentMonthStart),
    ]);

  const typedCategories = (categories ?? []) as Category[];
  const typedBudgets = (budgets ?? []) as Budget[];
  const typedExpenses = (expenses ?? []) as Expense[];
  const categoryById = new Map(
    typedCategories.map((category) => [category.id, category]),
  );

  const spendByCategory = new Map<string | null, number>();
  for (const expense of typedExpenses) {
    const key = expense.category_id ?? null;
    spendByCategory.set(
      key,
      (spendByCategory.get(key) ?? 0) + Number(expense.amount),
    );
  }

  const overallSpend = typedExpenses.reduce(
    (total, expense) => total + Number(expense.amount),
    0,
  );
  const overallBudget =
    typedBudgets.find((budget) => budget.category_id === null) ?? null;
  const overallBudgetAmount = overallBudget
    ? Number(overallBudget.amount)
    : null;
  const overallProgress = overallBudgetAmount
    ? getProgress(overallSpend, overallBudgetAmount)
    : 0;
  const overallRemaining =
    overallBudgetAmount === null ? null : overallBudgetAmount - overallSpend;
  const budgetedCategories = typedBudgets.filter(
    (budget) => budget.category_id !== null,
  ).length;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 shadow-lg shadow-orange-500/5 sm:p-7 lg:p-8">
        <div className="absolute inset-y-6 left-0 w-1 rounded-r-full bg-linear-to-b from-chart-3 via-primary to-chart-2" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-chart-3/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-4">
            <Badge
              variant="secondary"
              className="w-fit border-primary/20 bg-primary/10 text-primary"
            >
              Individual budgets
            </Badge>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                {monthLabel}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Your spend plan
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Budgets compare against expenses paid by {currentUser.name}.
              Couple-wide and split details stay on the expense pages.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Spent by you</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatCurrency(overallSpend)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">
                Overall budget
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {overallBudgetAmount
                  ? formatCurrency(overallBudgetAmount)
                  : "Not set"}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">
                Category limits
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {budgetedCategories}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ErrorBanner searchParams={resolvedSearchParams} />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr]">
        <div className="grid gap-5 content-start">
          <Card className="border-border/60 shadow-lg shadow-orange-500/5">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Personal runway
              </CardTitle>
              <CardDescription>
                Your month-to-date spend compared with your overall limit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {overallBudgetAmount ? (
                <>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-4xl font-semibold tabular-nums text-foreground">
                        {overallProgress}%
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {formatCurrency(overallSpend)} of{" "}
                        {formatCurrency(overallBudgetAmount)}
                      </div>
                    </div>
                    <Badge
                      variant={
                        overallRemaining !== null && overallRemaining < 0
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {overallRemaining !== null && overallRemaining < 0
                        ? `${formatCurrency(Math.abs(overallRemaining))} over`
                        : `${formatCurrency(overallRemaining ?? 0)} left`}
                    </Badge>
                  </div>
                  <Progress
                    value={overallProgress}
                    className={
                      overallProgress >= 100 ? "[&>div]:bg-destructive" : ""
                    }
                  />
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Add an overall budget to see your personal monthly runway.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-lg shadow-orange-500/5">
            <CardHeader>
              <CardTitle className="text-xl font-semibold">
                Add a limit
              </CardTitle>
              <CardDescription>
                Create an overall budget or a category-specific limit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createBudgetAction} className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category_id">Category</Label>
                  <select
                    id="category_id"
                    name="category_id"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    defaultValue=""
                  >
                    <option value="">Overall budget</option>
                    {typedCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="500"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="month">Month</Label>
                    <Input
                      id="month"
                      name="month"
                      type="month"
                      defaultValue={currentMonth}
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full sm:w-fit">
                  Save budget
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold">
                  Monthly limits
                </CardTitle>
                <CardDescription>
                  Each limit uses your individual spend for this month.
                </CardDescription>
              </div>
              <Link
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href="/expenses"
              >
                Review expenses →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {typedBudgets.length > 0 ? (
              <div className="space-y-3">
                {typedBudgets.map((budget) => {
                  const category = budget.category_id
                    ? categoryById.get(budget.category_id)
                    : null;
                  const spent =
                    budget.category_id === null
                      ? overallSpend
                      : (spendByCategory.get(budget.category_id) ?? 0);
                  const amount = Number(budget.amount);
                  const progress = getProgress(spent, amount);
                  const remaining = amount - spent;

                  return (
                    <div
                      key={budget.id}
                      className="rounded-2xl border border-border bg-muted/20 p-4"
                    >
                      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                        <div className="min-w-0 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 font-semibold text-foreground">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                  <CategoryIcon icon={category?.icon} />
                                </span>
                                <span className="truncate">
                                  {category?.name ?? "Overall budget"}
                                </span>
                              </div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {formatCurrency(spent)} spent of{" "}
                                {formatCurrency(amount)}
                              </div>
                            </div>
                            <Badge
                              variant={
                                progress >= 100 ? "destructive" : "secondary"
                              }
                            >
                              {progress}%
                            </Badge>
                          </div>

                          <Progress
                            value={progress}
                            className={
                              progress >= 100 ? "[&>div]:bg-destructive" : ""
                            }
                          />

                          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                            <div className="rounded-xl border border-border bg-background/60 p-3">
                              <div className="text-muted-foreground">Spent</div>
                              <div className="font-semibold tabular-nums">
                                {formatCurrency(spent)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-border bg-background/60 p-3">
                              <div className="text-muted-foreground">Left</div>
                              <div
                                className={
                                  remaining < 0
                                    ? "font-semibold tabular-nums text-destructive"
                                    : "font-semibold tabular-nums"
                                }
                              >
                                {remaining < 0
                                  ? `-${formatCurrency(Math.abs(remaining))}`
                                  : formatCurrency(remaining)}
                              </div>
                            </div>
                            <div className="rounded-xl border border-border bg-background/60 p-3 max-sm:col-span-2">
                              <div className="text-muted-foreground">Limit</div>
                              <div className="font-semibold tabular-nums">
                                {formatCurrency(amount)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] lg:min-w-64 lg:grid-cols-1">
                          <form
                            action={updateBudgetAction}
                            className="flex gap-2"
                          >
                            <input type="hidden" name="id" value={budget.id} />
                            <Input
                              name="amount"
                              type="number"
                              min="0.01"
                              step="0.01"
                              defaultValue={amount}
                              aria-label="Budget amount"
                            />
                            <Button type="submit" variant="outline">
                              Save
                            </Button>
                          </form>

                          <form action={deleteBudgetAction}>
                            <input type="hidden" name="id" value={budget.id} />
                            <Button
                              type="submit"
                              variant="destructive"
                              className="w-full"
                            >
                              Delete
                            </Button>
                          </form>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 py-10 text-center">
                <span className="text-4xl">◎</span>
                <p className="text-sm text-muted-foreground">
                  No budgets set for this month yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
