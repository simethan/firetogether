import { redirect } from "next/navigation";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CategoryFilter } from "@/components/expenses/category-filter";
import { CoupleBalanceTimeline } from "@/components/dashboard/couple-balance-timeline";
import { EnvelopeShelf } from "@/components/dashboard/envelope-shelf";
import { SectionHeader } from "@/components/dashboard/section-header";
import { SpendMapSection } from "@/components/dashboard/spend-map-section";
import { SpendingInsights } from "@/components/dashboard/spending-insights";
import { MonthSelector } from "@/components/dashboard/month-selector";
import { RecurringExpenses } from "@/components/dashboard/recurring-expenses";
import { buildScheduledDisplay } from "@/components/dashboard/recurring-expenses";
import { SpendingTrendsSparkline } from "@/components/dashboard/spending-trends-sparkline";
import { WorkspaceDialog } from "@/components/dashboard/workspace-dialog";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId, getCurrentCouple } from "@/lib/auth";
import { getRequestTimeZone } from "@/lib/timezone";
import {
  calculateDashboardSummary,
  computeBalanceTimeline,
  computeEnvelopeStatuses,
  computeMonthlyTrends,
  computeReadyToAssign,
  computeTotalIncome,
  detectRecurringExpenses,
  formatCurrency,
  formatMonthLabel,
  formatShortDate,
  generateInsights,
  getCurrentMonthValue,
  getGoalProgress,
  getLastNMonths,
  getMonthOffset,
  getMonthStartDate,
  getNextMonthEnd,
} from "@/lib/finance";
import type { Budget, Category, Expense, Income, SavingsGoal, ScheduledTransaction, User } from "@/lib/types";

export default async function DashboardPage({
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
  const tz = await getRequestTimeZone();
  const rawMonth = typeof params.month === "string" ? params.month : null;
  const selectedMonth =
    rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) && rawMonth <= getCurrentMonthValue(tz)
      ? rawMonth
      : getCurrentMonthValue(tz);
  const categoryFilter =
    typeof params.category === "string" && params.category.length > 0
      ? params.category
      : null;

  const currentMonth = getCurrentMonthValue(tz);
  const currentMonthStart = getMonthStartDate(selectedMonth);
  const monthLabel = formatMonthLabel(selectedMonth);
  const couple = await getCurrentCouple(user.couple_id);

  // Multi-month ranges for trends, balance, recurring
  const multiMonths = getLastNMonths(6, selectedMonth);
  const multiMonthStart = getMonthStartDate(multiMonths[multiMonths.length - 1]);
  const multiMonthEnd = getNextMonthEnd(selectedMonth);

  // Previous month for insights
  const prevMonth = getMonthOffset(1, selectedMonth);
  const prevMonthStart = getMonthStartDate(prevMonth);
  const prevMonthEnd = getMonthStartDate(selectedMonth);

  const [{ data: members }, { data: categories }, { data: multiMonthExpenses }, { data: budgets }, { data: goals }, { data: income }, { data: scheduled }] =
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
        .gte("expense_date", multiMonthStart)
        .lt("expense_date", multiMonthEnd)
        .order("expense_date", { ascending: false }),
      admin
        .from("budgets")
        .select("id, couple_id, category_id, month, amount, funded_amount, is_shared")
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
      admin
        .from("income")
        .select("id, couple_id, user_id, amount, source, income_date, created_at")
        .eq("couple_id", user.couple_id)
        .gte("income_date", currentMonthStart)
        .lt("income_date", getNextMonthEnd(selectedMonth))
        .order("income_date", { ascending: false }),
      admin
        .from("scheduled_transactions")
        .select(
          "id, couple_id, user_id, category_id, payee_id, amount, description, split_type, custom_ratio, frequency, frequency_interval, next_date, end_date, is_active, created_at",
        )
        .eq("couple_id", user.couple_id)
        .order("next_date", { ascending: true }),
    ]);

  const typedMembers = (members ?? []) as User[];
  const typedCategories = (categories ?? []) as Category[];
  const typedMultiMonthExpenses = (multiMonthExpenses ?? []) as Expense[];
  const typedMonthlyExpenses = typedMultiMonthExpenses.filter((e) => {
    const d = e.expense_date;
    return d >= currentMonthStart && d < getNextMonthEnd(selectedMonth);
  });
  const typedPrevMonthExpenses = typedMultiMonthExpenses.filter((e) => {
    const d = e.expense_date;
    return d >= prevMonthStart && d < prevMonthEnd;
  });
  const typedBudgets = (budgets ?? []) as Budget[];
  const typedGoals = (goals ?? []) as SavingsGoal[];
  const typedIncome = (income ?? []) as Income[];
  const typedScheduled = (scheduled ?? []) as ScheduledTransaction[];

  const totalIncome = computeTotalIncome(typedIncome);
  const totalFunded = typedBudgets.reduce(
    (sum, b) => sum + (Number(b.funded_amount) || 0),
    0,
  );
  const readyToAssign = computeReadyToAssign(totalIncome, totalFunded);
  const envelopes = computeEnvelopeStatuses(typedBudgets, typedMonthlyExpenses, typedCategories, user.id);
  const overdrawnCount = envelopes.filter((e) => e.status === "overdrawn").length;
  const totalEnvelopeSpent = envelopes.reduce((sum, e) => sum + e.spent, 0);

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

  // Multi-month computed values
  const trends = computeMonthlyTrends(typedMultiMonthExpenses);
  const balanceTimeline = computeBalanceTimeline(
    typedMultiMonthExpenses,
    typedMembers,
  );
  const recurring = detectRecurringExpenses(
    typedMultiMonthExpenses,
    typedCategories,
  );
  const scheduledDisplays = buildScheduledDisplay(typedScheduled, categoryById);

  // Insights from current vs previous month
  const currentWithMeta = typedMonthlyExpenses.map((expense) => ({
    ...expense,
    categories: categoryById.get(expense.category_id ?? "") ?? undefined,
    users: userById.get(expense.user_id ?? "") ?? undefined,
  }));
  const prevWithMeta = typedPrevMonthExpenses.map((expense) => ({
    ...expense,
    categories: categoryById.get(expense.category_id ?? "") ?? undefined,
    users: userById.get(expense.user_id ?? "") ?? undefined,
  }));
  const insights = generateInsights(
    currentWithMeta,
    prevWithMeta,
    typedCategories,
  );

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
  const filteredCategorySummaries = categoryFilter
    ? summary.categorySummaries.filter((c) => c.categoryId === categoryFilter)
    : summary.categorySummaries;
  const averageGoalProgress = typedGoals.length
    ? Math.round(
        typedGoals.reduce((total, goal) => total + getGoalProgress(goal), 0) /
          typedGoals.length,
      )
    : 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Hero section */}
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <MonthSelector currentMonth={currentMonth} />
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-taupe">
              Together · {monthLabel}
            </div>
            <div className="flex items-end gap-3">
              <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground tabular-nums break-words sm:text-5xl lg:text-7xl">
                {formatCurrency(summary.totalSpent)}
              </h1>
              <SpendingTrendsSparkline trends={trends} />
            </div>
            {/* The merge: two streams becoming one pool */}
            <svg
              aria-hidden
              className="h-5 w-28 text-ember/70"
              viewBox="0 0 120 20"
              fill="none"
            >
              <path
                d="M2 2 C40 2 44 18 60 18"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M118 2 C80 2 76 18 60 18"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <div className="font-mono text-xs tabular-nums text-taupe">
              You {formatCurrency(myPaidThisMonth)} · Partner{" "}
              {formatCurrency(summary.totalSpent - myPaidThisMonth)} · Shared{" "}
              {formatCurrency(summary.sharedSpent)}
            </div>
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
            <WorkspaceDialog
              members={typedMembers}
              inviteCode={couple?.invite_code ?? null}
              currentUserId={user.id}
            />
          </div>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card size="sm">
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

        <Card size="sm">
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

        <Card size="sm">
          <CardHeader>
            <CardDescription>Income</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {formatCurrency(totalIncome)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Money coming in this month.
          </CardContent>
        </Card>
      </section>

      {/* Spend map + Budget + Goals */}
      <section className="grid gap-5 lg:grid-cols-[1.45fr_0.9fr]">
        <Card>
          <CardHeader>
            <SectionHeader
              eyebrow="Spend map"
              title="Spend map"
              description={
                categoryFilter
                  ? `Filtered view for "${categoryById.get(categoryFilter)?.name ?? "selected category"}" this month.`
                  : "Category totals for this month, including uncategorized spending. Click a category to see its history."
              }
              action={{ href: "/expenses", label: "Open →" }}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <CategoryFilter
              categories={typedCategories}
              selectedId={categoryFilter}
            />
            {/* Category bar chart + clickable list */}
            <SpendMapSection
              filteredCategorySummaries={filteredCategorySummaries}
              typedMultiMonthExpenses={typedMultiMonthExpenses}
              multiMonths={multiMonths}
              typedMonthlyExpenses={typedMonthlyExpenses}
              userById={userById}
              currentUserId={user.id}
              categoryFilter={categoryFilter}
              categoryById={categoryById}
              monthLabel={monthLabel}
            />
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <Card>
            <CardContent className="pt-6">
              <EnvelopeShelf
                envelopes={envelopes}
                readyToAssign={readyToAssign}
              />
              {overdrawnCount > 0 && (
                <div className="mt-4 rounded-xl border border-clay/20 bg-clay/5 px-3 py-2 text-xs text-clay">
                  {overdrawnCount} envelope{overdrawnCount === 1 ? "" : "s"}{" "}
                  overdrawn — cover from the budgets page
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeader
                eyebrow="Goals"
                title="Goals"
                description="Average progress across active goals."
                action={{ href: "/goals", label: "Edit →" }}
              />
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

      {/* Couple Balance Timeline */}
      <section>
        <Card>
          <CardHeader>
            <SectionHeader
              eyebrow="Couple balance"
              title="Couple balance"
              description="How spending and shared expenses have been distributed between partners over time."
            />
          </CardHeader>
          <CardContent>
            <CoupleBalanceTimeline data={balanceTimeline} />
          </CardContent>
        </Card>
      </section>

      {/* Insights + Recurring */}
      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionHeader
              eyebrow="Insights"
              title="Spending insights"
              description="Month-over-month changes in your spending patterns."
            />
          </CardHeader>
          <CardContent>
            <SpendingInsights insights={insights} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeader
              eyebrow="Recurring"
              title="Recurring"
              description="Expenses that appear regularly across months."
            />
          </CardHeader>
          <CardContent>
            <RecurringExpenses recurring={recurring} scheduled={scheduledDisplays} />
          </CardContent>
        </Card>
      </section>

      {/* Recent activity + Quick actions */}
      <section className="grid gap-5 lg:grid-cols-[1fr_0.72fr]">
        <Card>
          <CardHeader>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-taupe">
                Ledger
              </h2>
              <Link
                className="font-mono text-[11px] text-ember hover:underline"
                href="/expenses"
              >
                See all →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentExpenses.length > 0 ? (
              <ul className="font-mono text-sm">
                {recentExpenses.map((expense) => {
                  const category = expense.category_id
                    ? categoryById.get(expense.category_id)
                    : null;
                  const payer = expense.user_id
                    ? userById.get(expense.user_id)
                    : null;
                  const payerName =
                    payer?.id === user.id
                      ? "You"
                      : (payer?.name ?? "Unknown");

                  return (
                    <li
                      key={expense.id}
                      className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 border-b border-border/60 py-2.5 last:border-0"
                    >
                      <span className="tabular-nums text-taupe">
                        {formatShortDate(expense.expense_date)}
                      </span>
                      <span className="min-w-0 truncate text-foreground">
                        <span className="font-sans">
                          {expense.description ?? category?.name ?? "Expense"}
                        </span>
                        <span className="text-taupe"> · {payerName}</span>
                      </span>
                      <span className="tabular-nums text-foreground">
                        {formatCurrency(Number(expense.amount))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Nothing logged this month yet.
                </p>
                <Link
                  className="font-mono text-[11px] text-ember hover:underline"
                  href="/expenses/new"
                >
                  Add an expense →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeader eyebrow="Actions" title="Quick actions" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Link
              className="col-span-2 rounded-2xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              href="/expenses/new"
            >
              Add expense
            </Link>
            <Link
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
              href="/expenses"
            >
              Expenses
            </Link>
            <Link
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
              href="/income"
            >
              Income
            </Link>
            <Link
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
              href="/budgets"
            >
              Budgets
            </Link>
            <Link
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
              href="/scheduled"
            >
              Scheduled
            </Link>
            <Link
              className="col-span-2 rounded-xl border border-border bg-background px-3 py-2.5 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
              href="/goals"
            >
              Goals
            </Link>
            <Link
              className="col-span-2 rounded-xl border border-border bg-background px-3 py-2.5 text-center text-xs font-medium text-foreground transition-colors hover:bg-muted"
              href="/year-in-review"
            >
              Year in Review →
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
