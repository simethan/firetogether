import { redirect } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId, getCurrentCouple } from "@/lib/auth";
import { calculateDashboardSummary, formatCurrency, getCurrentMonthValue, getMonthStartDate } from "@/lib/finance";
import type { Budget, Category, Expense, SavingsGoal, User } from "@/lib/types";

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

  const couple = await getCurrentCouple(user.couple_id);

  const [{ data: members }, { data: categories }, { data: monthlyExpenses }, { data: allExpenses }, { data: budgets }, { data: goals }] = await Promise.all([
    admin.from("users").select("id, couple_id, email, name, created_at").eq("couple_id", user.couple_id).order("created_at", { ascending: true }),
    admin.from("categories").select("id, couple_id, name, icon, is_default, created_at").eq("couple_id", user.couple_id).order("is_default", { ascending: false }).order("name", { ascending: true }),
    admin.from("expenses").select("id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at").eq("couple_id", user.couple_id).gte("expense_date", currentMonthStart).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    admin.from("expenses").select("id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at").eq("couple_id", user.couple_id).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    admin.from("budgets").select("id, couple_id, category_id, month, amount").eq("couple_id", user.couple_id).eq("month", currentMonthStart),
    admin.from("savings_goals").select("id, couple_id, created_by, name, target_amount, current_amount, deadline, is_shared, icon, created_at").eq("couple_id", user.couple_id).order("created_at", { ascending: false }).limit(6),
  ]);

  const typedMembers = (members ?? []) as User[];
  const typedCategories = (categories ?? []) as Category[];
  const typedMonthlyExpenses = (monthlyExpenses ?? []) as Expense[];
  const typedAllExpenses = (allExpenses ?? []) as Expense[];
  const typedBudgets = (budgets ?? []) as Budget[];
  const typedGoals = (goals ?? []) as SavingsGoal[];

  const categoryById = new Map(typedCategories.map((category) => [category.id, category]));
  const userById = new Map(typedMembers.map((member) => [member.id, member]));

  const summary = calculateDashboardSummary({
    expenses: typedAllExpenses.map((expense) => ({
      ...expense,
      categories: categoryById.get(expense.category_id ?? "") ?? undefined,
      users: userById.get(expense.user_id ?? "") ?? undefined,
    })),
    users: typedMembers,
    budgets: typedBudgets,
    categories: typedCategories,
  });

  const recentExpenses = typedMonthlyExpenses.slice(0, 6);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-lg shadow-orange-500/5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Badge variant="secondary" className="w-fit">
            FireTogether dashboard
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back, {user.name}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            {couple?.invite_code ? `Couple code ${couple.invite_code}` : "Your couple workspace is ready."} Shared expenses count toward settle-up. Personal expenses stay visible for reference.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/expenses/new"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add expense
          </Link>
          <Link
            href="/shortcut"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            iPhone shortcut
          </Link>
          <Link
            href="/budgets"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Budgets
          </Link>
          <Link
            href="/goals"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Goals
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Total spent</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(summary.totalSpent)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">All expenses recorded for this couple.</CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Shared spend</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(summary.sharedSpent)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Shared and custom split expenses only.</CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Personal spend</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(summary.personalSpent)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Personal spending tracked separately.</CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Settle up</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(summary.settleUpAmount)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {summary.balanceA && summary.balanceB
              ? `${summary.balanceB.name} owes ${summary.balanceA.name} based on shared expenses.`
              : "Add at least two members to calculate settle-up."}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>Current month totals across your couple&apos;s categories.</CardDescription>
          </CardHeader>
          <CardContent>
            <DashboardCharts data={summary.categorySummaries} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/60 shadow-lg shadow-orange-500/5">
            <CardHeader>
              <CardTitle>Balance snapshot</CardTitle>
              <CardDescription>Who is ahead after shared expenses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary.balanceA && summary.balanceB ? (
                <>
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{summary.balanceA.name}</span>
                      <Badge variant={summary.balanceA.net >= 0 ? "secondary" : "destructive"}>
                        {summary.balanceA.net >= 0 ? "owed" : "owes"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(summary.balanceA.net)}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{summary.balanceB.name}</span>
                      <Badge variant={summary.balanceB.net >= 0 ? "secondary" : "destructive"}>
                        {summary.balanceB.net >= 0 ? "owed" : "owes"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(summary.balanceB.net)}</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Add both couple members to compute balances.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-lg shadow-orange-500/5">
            <CardHeader>
              <CardTitle>Goal preview</CardTitle>
              <CardDescription>Most recent savings goals in this couple.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {typedGoals.length > 0 ? (
                typedGoals.slice(0, 3).map((goal) => {
                  const progress = Math.min(100, Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100));

                  return (
                    <div key={goal.id} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{goal.name}</span>
                        <span className="text-muted-foreground">{progress}%</span>
                      </div>
                      <Progress value={progress} />
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">No goals yet. Create one on the goals page.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle>Recent expenses</CardTitle>
            <CardDescription>Latest entries from the current month.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentExpenses.length > 0 ? (
              <div className="space-y-4">
                {recentExpenses.map((expense, index) => {
                  const category = expense.category_id ? typedCategories.find((item) => item.id === expense.category_id) : null;
                  const payer = expense.user_id ? userById.get(expense.user_id) : null;

                  return (
                    <div key={expense.id}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-foreground">
                            {expense.description ?? category?.name ?? "Expense"}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{payer?.name ?? "Unknown payer"}</span>
                            <span>•</span>
                            <span>{expense.expense_date}</span>
                            <Badge variant="outline">{expense.split_type}</Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-foreground">{formatCurrency(Number(expense.amount))}</div>
                          <div className="text-xs text-muted-foreground">{category?.name ?? "Uncategorized"}</div>
                        </div>
                      </div>
                      {index < recentExpenses.length - 1 ? <Separator className="mt-4" /> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No expenses recorded this month yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle>Budget snapshot</CardTitle>
            <CardDescription>{currentMonth} totals versus budget.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.categorySummaries.length > 0 ? (
              summary.categorySummaries.slice(0, 5).map((category) => {
                const percent = category.budget ? Math.min(100, Math.round((category.amount / category.budget) * 100)) : 0;

                return (
                  <div key={category.categoryId ?? category.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{category.name}</span>
                      <span className="text-muted-foreground">
                        {formatCurrency(category.amount)}
                        {category.budget ? ` / ${formatCurrency(category.budget)}` : ""}
                      </span>
                    </div>
                    <Progress value={percent} />
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No categorized spending this month yet.</p>
            )}

            <div className="pt-2 text-sm text-muted-foreground">
              <Link className="text-primary underline-offset-4 hover:underline" href="/budgets">
                Manage budgets
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}