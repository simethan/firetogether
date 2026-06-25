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
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId, getCurrentCouple } from "@/lib/auth";
import {
  calculateDashboardSummary,
  formatCurrency,
  getCurrentMonthValue,
  getGoalProgress,
  getMonthStartDate,
} from "@/lib/finance";
import type { Budget, Category, Expense, SavingsGoal, User } from "@/lib/types";

function formatMonthLabel(monthValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthValue}-01T00:00:00`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function getSettleCopy(summary: ReturnType<typeof calculateDashboardSummary>) {
  if (!summary.balanceA || !summary.balanceB) {
    return "Invite your partner to calculate settle-up.";
  }

  if (summary.settleUpAmount < 0.01) {
    return "You’re square for shared expenses.";
  }

  return `${summary.balanceB.name} owes ${summary.balanceA.name}.`;
}

export default async function DashboardPage() {
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

  const currentMonth = getCurrentMonthValue();
  const currentMonthStart = getMonthStartDate(currentMonth);
  const monthLabel = formatMonthLabel(currentMonth);
  const couple = await getCurrentCouple(user.couple_id);

  const [
    { data: members },
    { data: categories },
    { data: monthlyExpenses },
    { data: budgets },
    { data: goals },
  ] = await Promise.all([
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
      .gte("expense_date", currentMonthStart)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("budgets")
      .select("id, couple_id, category_id, month, amount")
      .eq("couple_id", user.couple_id)
      .eq("month", currentMonthStart),
    admin
      .from("savings_goals")
      .select(
        "id, couple_id, created_by, name, target_amount, current_amount, deadline, is_shared, icon, created_at",
      )
      .eq("couple_id", user.couple_id)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const typedMembers = (members ?? []) as User[];
  const typedCategories = (categories ?? []) as Category[];
  const typedMonthlyExpenses = (monthlyExpenses ?? []) as Expense[];
  const typedBudgets = (budgets ?? []) as Budget[];
  const typedGoals = (goals ?? []) as SavingsGoal[];

  const categoryById = new Map(
    typedCategories.map((category) => [category.id, category]),
  );
  const userById = new Map(typedMembers.map((member) => [member.id, member]));

  const summary = calculateDashboardSummary({
    expenses: typedMonthlyExpenses.map((expense) => ({
      ...expense,
      categories: categoryById.get(expense.category_id ?? "") ?? undefined,
      users: userById.get(expense.user_id ?? "") ?? undefined,
    })),
    users: typedMembers,
    budgets: typedBudgets,
    categories: typedCategories,
  });

  const recentExpenses = typedMonthlyExpenses.slice(0, 4);
  const myPaidThisMonth = typedMonthlyExpenses
    .filter((expense) => expense.user_id === user.id)
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const myPersonalSpend = typedMonthlyExpenses
    .filter(
      (expense) =>
        expense.user_id === user.id && expense.split_type === "personal",
    )
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const overallBudget =
    typedBudgets.find((budget) => budget.category_id === null) ?? null;
  const overallBudgetAmount = overallBudget
    ? Number(overallBudget.amount)
    : null;
  const overallBudgetPercent = overallBudgetAmount
    ? Math.min(100, Math.round((myPaidThisMonth / overallBudgetAmount) * 100))
    : 0;
  const budgetRemaining =
    overallBudgetAmount === null ? null : overallBudgetAmount - myPaidThisMonth;
  const topCategory = summary.categorySummaries[0] ?? null;
  const averageGoalProgress = typedGoals.length
    ? Math.round(
        typedGoals.reduce((total, goal) => total + getGoalProgress(goal), 0) /
          typedGoals.length,
      )
    : 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 shadow-lg shadow-orange-500/5 sm:p-7 lg:p-8">
        <div className="absolute inset-y-6 left-0 w-1 rounded-r-full bg-linear-to-b from-primary via-chart-4 to-chart-2" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-4">
            <Badge
              variant="secondary"
              className="w-fit border-primary/20 bg-primary/10 text-primary"
            >
              {monthLabel}
            </Badge>
            <div className="space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Monthly spend
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                {formatCurrency(summary.totalSpent)}
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              A clean read on this month: what the couple spent, what you paid,
              and whether shared expenses need settling.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Top category</div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="truncate text-lg font-semibold text-foreground">
                  {topCategory?.name ?? "No spending yet"}
                </span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                  {topCategory ? formatCurrency(topCategory.amount) : "—"}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Workspace</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span>
                  {typedMembers.length} member
                  {typedMembers.length === 1 ? "" : "s"}
                </span>
                {couple?.invite_code ? (
                  <code className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-xs">
                    {couple.invite_code}
                  </code>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60 shadow-sm" size="sm">
          <CardHeader>
            <CardDescription>Overall spend</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {formatCurrency(summary.totalSpent)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            All expenses logged in {monthLabel}.
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm" size="sm">
          <CardHeader>
            <CardDescription>Paid by me</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {formatCurrency(myPaidThisMonth)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Includes {formatCurrency(myPersonalSpend)} marked personal.
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm" size="sm">
          <CardHeader>
            <CardDescription>Shared spend</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {formatCurrency(summary.sharedSpent)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Shared and custom splits only.
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm" size="sm">
          <CardHeader>
            <CardDescription>Settle-up</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {formatCurrency(summary.settleUpAmount)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {getSettleCopy(summary)}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.9fr]">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold">
                  Spend map
                </CardTitle>
                <CardDescription>
                  Category totals for this month, including uncategorized
                  spending.
                </CardDescription>
              </div>
              <Link
                href="/expenses"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open expense details →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <DashboardCharts data={summary.categorySummaries} />
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <Card className="border-border/60 shadow-lg shadow-orange-500/5">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-semibold">
                    Budget
                  </CardTitle>
                  <CardDescription>
                    Your individual monthly limit.
                  </CardDescription>
                </div>
                <Link
                  href="/budgets"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Manage →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {overallBudgetAmount ? (
                <>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-3xl font-semibold tabular-nums">
                        {overallBudgetPercent}%
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(myPaidThisMonth)} of{" "}
                        {formatCurrency(overallBudgetAmount)}
                      </div>
                    </div>
                    <Badge
                      variant={
                        budgetRemaining !== null && budgetRemaining < 0
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {budgetRemaining !== null && budgetRemaining < 0
                        ? `${formatCurrency(Math.abs(budgetRemaining))} over`
                        : `${formatCurrency(budgetRemaining ?? 0)} left`}
                    </Badge>
                  </div>
                  <Progress
                    value={overallBudgetPercent}
                    className={
                      overallBudgetPercent >= 100
                        ? "[&>div]:bg-destructive"
                        : ""
                    }
                  />
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  No overall budget set for {monthLabel}. Add one to see your
                  individual monthly runway here.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-lg shadow-orange-500/5">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-semibold">Goals</CardTitle>
                  <CardDescription>
                    Average progress across active goals.
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
            <CardContent className="space-y-4">
              {typedGoals.length > 0 ? (
                <>
                  <div className="flex items-end justify-between gap-4">
                    <div className="text-3xl font-semibold tabular-nums">
                      {averageGoalProgress}%
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {typedGoals.length} active goal
                      {typedGoals.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Progress value={averageGoalProgress} />
                  <div className="space-y-2">
                    {typedGoals.slice(0, 2).map((goal) => {
                      const progress = getGoalProgress(goal);

                      return (
                        <div
                          key={goal.id}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="truncate text-foreground">
                            {goal.icon ? `${goal.icon} ` : ""}
                            {goal.name}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {progress}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  No goals yet. Create one to track savings progress from the
                  dashboard.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_0.72fr]">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold">
                  Recent activity
                </CardTitle>
                <CardDescription>Latest expenses this month.</CardDescription>
              </div>
              <Link
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href="/expenses"
              >
                See all →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentExpenses.length > 0 ? (
              <div className="divide-y divide-border/70">
                {recentExpenses.map((expense) => {
                  const category = expense.category_id
                    ? categoryById.get(expense.category_id)
                    : null;
                  const payer = expense.user_id
                    ? userById.get(expense.user_id)
                    : null;

                  return (
                    <div
                      key={expense.id}
                      className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <CategoryIcon icon={category?.icon} fallback="💸" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {expense.description ?? category?.name ?? "Expense"}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{formatShortDate(expense.expense_date)}</span>
                            <span className="opacity-40">·</span>
                            <span>
                              {payer?.id === user.id
                                ? "You"
                                : (payer?.name ?? "Unknown")}
                            </span>
                            <span className="opacity-40">·</span>
                            <span>{expense.split_type}</span>
                          </div>
                        </div>
                      </div>
                      <div className="font-semibold tabular-nums text-foreground sm:text-right">
                        {formatCurrency(Number(expense.amount))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 py-8 text-center">
                <span className="text-4xl">🧾</span>
                <p className="text-sm text-muted-foreground">
                  No expenses recorded this month yet.
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

        <Card className="border-border/60 bg-primary/5 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              Quick actions
            </CardTitle>
            <CardDescription>
              Keep the dashboard focused. Details live on their own pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-colors hover:bg-primary/90"
              href="/expenses/new"
            >
              Add expense
            </Link>
            <Link
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              href="/expenses"
            >
              Review expense details
            </Link>
            <Link
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              href="/budgets"
            >
              Manage budgets
            </Link>
            <Link
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              href="/goals"
            >
              Update goals
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
