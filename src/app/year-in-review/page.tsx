import { redirect } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryIcon } from "@/components/categories/category-icon";
import { YearInReviewChart } from "@/components/dashboard/year-in-review-chart";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import {
  computeMonthlyTrends,
  formatCurrency,
  formatShortMonthLabel,
  getSpendingPersonality,
} from "@/lib/finance";
import type { Category, Expense, User } from "@/lib/types";

function getYearStartDate(year: number) {
  return `${year}-01-01`;
}

function getYearEndDate(year: number) {
  return `${year + 1}-01-01`;
}

function getCurrentYear() {
  return new Date().getFullYear();
}

export default async function YearInReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();
  const { data: user } = await admin
    .from("users")
    .select("id, couple_id, email, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (!user?.couple_id) {
    redirect("/onboarding");
  }

  const params = await searchParams;
  const rawYear = typeof params.year === "string" ? params.year : null;
  const selectedYear = rawYear && /^\d{4}$/.test(rawYear) ? parseInt(rawYear, 10) : getCurrentYear();

  const yearStart = getYearStartDate(selectedYear);
  const yearEnd = getYearEndDate(selectedYear);

  const [{ data: members }, { data: categories }, { data: expenses }, { data: goals }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, couple_id, email, name, created_at")
        .eq("couple_id", user.couple_id)
        .order("created_at", { ascending: true }),
      admin
        .from("categories")
        .select("id, couple_id, name, icon, is_default, created_at")
        .eq("couple_id", user.couple_id)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true }),
      admin
        .from("expenses")
        .select(
          "id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at",
        )
        .eq("couple_id", user.couple_id)
        .gte("expense_date", yearStart)
        .lt("expense_date", yearEnd)
        .order("expense_date", { ascending: false })
        .limit(1000),
      admin
        .from("savings_goals")
        .select(
          "id, couple_id, created_by, name, target_amount, current_amount, deadline, is_shared, icon, created_at",
        )
        .eq("couple_id", user.couple_id)
        .order("created_at", { ascending: false }),
    ]);

  const typedMembers = (members ?? []) as User[];
  const typedCategories = (categories ?? []) as Category[];
  const typedExpenses = (expenses ?? []) as Expense[];
  const typedGoals = (goals ?? []) as { id: string; name: string; target_amount: number; current_amount: number; icon: string | null; deadline: string | null }[];

  const categoryById = new Map(
    typedCategories.map((c) => [c.id, c]),
  );
  const userById = new Map(typedMembers.map((m) => [m.id, m]));

  // Total spent
  const totalSpent = typedExpenses.reduce(
    (sum, e) => sum + Number(e.amount),
    0,
  );

  // Shared vs personal
  const sharedSpent = typedExpenses
    .filter((e) => e.split_type !== "personal")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const personalSpent = typedExpenses
    .filter((e) => e.split_type === "personal")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const sharedRatio = totalSpent > 0 ? sharedSpent / totalSpent : 0;
  const personalRatio = totalSpent > 0 ? personalSpent / totalSpent : 0;

  const personality = getSpendingPersonality(totalSpent, sharedRatio, personalRatio);

  // Per-category totals
  const categoryTotals = new Map<string | null, { name: string; icon: string | null; amount: number }>();
  for (const expense of typedExpenses) {
    const key = expense.category_id ?? null;
    const existing = categoryTotals.get(key) ?? {
      name: key ? (categoryById.get(key)?.name ?? "Uncategorized") : "Uncategorized",
      icon: key ? (categoryById.get(key)?.icon ?? null) : null,
      amount: 0,
    };
    existing.amount += Number(expense.amount);
    categoryTotals.set(key, existing);
  }

  const categoryBreakdown = Array.from(categoryTotals.values())
    .sort((a, b) => b.amount - a.amount);

  // Biggest spending month
  const monthlyTrends = computeMonthlyTrends(typedExpenses);
  const biggestMonth = monthlyTrends.reduce(
    (max, m) => (m.total > max.total ? m : max),
    monthlyTrends[0] ?? null,
  );

  // Top category
  const topCategory = categoryBreakdown[0] ?? null;

  // Goals progress
  const completedGoals = typedGoals.filter(
    (g) => g.current_amount >= g.target_amount,
  );
  const inProgressGoals = typedGoals.filter(
    (g) => g.current_amount < g.target_amount,
  );

  const prevYear = selectedYear - 1;
  const nextYear = selectedYear + 1;
  const isCurrentYear = selectedYear === getCurrentYear();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 sm:p-7 lg:p-8">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Badge
              variant="secondary"
              className="w-fit border-primary/20 bg-primary/10 text-primary"
            >
              Year in Review
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              {selectedYear}
            </h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              A full-year look at your finances as a couple — spending trends,
              category breakdowns, and savings progress.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/year-in-review?year=${prevYear}`}
              className="inline-flex h-8 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              ← {prevYear}
            </Link>
            {!isCurrentYear && (
              <Link
                href={`/year-in-review?year=${nextYear}`}
                className="inline-flex h-8 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {nextYear} →
              </Link>
            )}
            <Link
              href="/dashboard"
              className="inline-flex h-8 items-center justify-center rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard →
            </Link>
          </div>
        </div>
      </section>

      {/* Annual summary cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Total spent</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {formatCurrency(totalSpent)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Across all categories in {selectedYear}.
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Biggest month</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {biggestMonth ? formatCurrency(biggestMonth.total) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {biggestMonth ? biggestMonth.label : "No spending data"}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Top category</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums truncate">
              {topCategory ? topCategory.name : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {topCategory ? formatCurrency(topCategory.amount) : "No spending data"}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Spending personality</CardDescription>
            <CardTitle className="text-2xl font-semibold">
              {personality}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {sharedRatio > 0.6
              ? "Mostly shared expenses with your partner."
              : personalRatio > 0.6
                ? "Mostly personal spending."
                : "A balanced mix of shared and personal."}
          </CardContent>
        </Card>
      </section>

      {/* Monthly bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">
            Monthly spending
          </CardTitle>
          <CardDescription>
            How your spending fluctuated month by month in {selectedYear}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyTrends.length > 0 ? (
            <YearInReviewChart data={monthlyTrends} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 py-12 text-center">
              <span className="text-4xl">📊</span>
              <p className="text-sm text-muted-foreground">
                No expenses recorded in {selectedYear}.
              </p>
              <Link
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href="/expenses/new"
              >
                Add an expense →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category breakdown + Goals */}
      <section className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              Category breakdown
            </CardTitle>
            <CardDescription>
              Where your money went in {selectedYear}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length > 0 ? (
              <div className="space-y-2">
                {categoryBreakdown.map((cat) => {
                  const percent =
                    totalSpent > 0
                      ? Math.round((cat.amount / totalSpent) * 100)
                      : 0;

                  return (
                    <div
                      key={cat.name}
                      className="flex items-center gap-3 rounded-xl bg-muted/30 px-3 py-2.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CategoryIcon icon={cat.icon} fallback={cat.name[0]} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-sm font-medium text-foreground">
                            {cat.name}
                          </span>
                          <span className="ml-2 shrink-0 font-mono text-sm tabular-nums text-foreground">
                            {formatCurrency(cat.amount)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Progress value={percent} className="h-1.5" />
                          <span className="w-8 text-right text-xs text-muted-foreground">
                            {percent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 py-8 text-center">
                <span className="text-4xl">📂</span>
                <p className="text-sm text-muted-foreground">
                  No categories with spending yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-semibold">
                    Goals
                  </CardTitle>
                  <CardDescription>
                    {completedGoals.length} completed, {inProgressGoals.length} in progress.
                  </CardDescription>
                </div>
                <Link
                  href="/goals"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Edit →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {typedGoals.length > 0 ? (
                <>
                  {completedGoals.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-chart-3">
                        Completed
                      </h4>
                      <div className="space-y-2">
                        {completedGoals.map((goal) => (
                          <div
                            key={goal.id}
                            className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2"
                          >
                            <span className="text-sm font-medium text-foreground">
                              {goal.icon ? `${goal.icon} ` : ""}
                              {goal.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-chart-3"
                            >
                              Done
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {inProgressGoals.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        In progress
                      </h4>
                      <div className="space-y-2">
                        {inProgressGoals.slice(0, 4).map((goal) => {
                          const progress = Math.round(
                            (goal.current_amount / goal.target_amount) * 100,
                          );

                          return (
                            <div
                              key={goal.id}
                              className="space-y-1.5 rounded-xl bg-muted/30 px-3 py-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-foreground">
                                  {goal.icon ? `${goal.icon} ` : ""}
                                  {goal.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(goal.current_amount)} /{" "}
                                  {formatCurrency(goal.target_amount)}
                                </span>
                              </div>
                              <Progress value={progress} className="h-1.5" />
                              <div className="text-right text-xs text-muted-foreground">
                                {progress}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 py-6 text-center">
                  <span className="text-4xl">🎯</span>
                  <p className="text-sm text-muted-foreground">
                    No goals set yet for {selectedYear}.
                  </p>
                  <Link
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    href="/goals"
                  >
                    Create a goal →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <div className="flex items-center justify-center py-4">
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
