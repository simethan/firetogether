import { redirect } from "next/navigation";
import Link from "next/link";

import { CategoryIcon } from "@/components/categories/category-icon";
import { CategoryFilter } from "@/components/expenses/category-filter";
import { ExportButtons } from "@/components/expenses/export-buttons";
import { MonthSelector } from "@/components/dashboard/month-selector";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import {
  formatCurrency,
  getCurrentMonthValue,
  getMonthOffset,
  getMonthStartDate,
  getNextMonthEnd,
  getShareForExpense as getExpenseShare,
  formatMonthLabel,
  roundCurrency,
} from "@/lib/finance";
import type { Category, Expense, User } from "@/lib/types";

type MemberBreakdown = {
  user: User;
  paid: number;
  responsible: number;
  personal: number;
  sharedPaid: number;
};

type SplitBreakdown = {
  label: string;
  total: number;
  count: number;
  description: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { page: pageParam, category: categoryParam, month: monthParam } = await searchParams;
  const rawMonth = typeof monthParam === "string" ? monthParam : null;
  const selectedMonth =
    rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) && rawMonth <= getCurrentMonthValue()
      ? rawMonth
      : getCurrentMonthValue();
  const categoryFilter =
    typeof categoryParam === "string" && categoryParam.length > 0
      ? categoryParam
      : null;
  const currentPage = Math.max(1, parseInt(String(pageParam ?? "1"), 10) || 1);
  const pageSize = 20;

  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id, email, name, created_at")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) {
    redirect("/onboarding");
  }

  const currentMonth = getCurrentMonthValue();
  const monthStart = getMonthStartDate(selectedMonth);
  const monthEnd = getNextMonthEnd(selectedMonth);
  const monthLabel = formatMonthLabel(selectedMonth);

  const membersQuery = admin
    .from("users")
    .select("id, couple_id, email, name, created_at")
    .eq("couple_id", currentUser.couple_id)
    .order("created_at", { ascending: true });

  const categoriesQuery = admin
    .from("categories")
    .select("id, couple_id, name, icon, is_default, created_at")
    .eq("couple_id", currentUser.couple_id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  let expensesQuery = admin
    .from("expenses")
    .select(
      "id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at",
      { count: "exact" },
    )
    .eq("couple_id", currentUser.couple_id)
    .gte("expense_date", monthStart)
    .lt("expense_date", monthEnd);

  if (categoryFilter) {
    expensesQuery = expensesQuery.eq("category_id", categoryFilter);
  }

  expensesQuery = expensesQuery
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  const [
    { data: members },
    { data: categories },
    { data: expenses, count: expensesCount },
  ] = await Promise.all([membersQuery, categoriesQuery, expensesQuery]);

  // Fetch ALL expenses for this month — no pagination — for summary cards & export
  let allMonthQuery = admin
    .from("expenses")
    .select(
      "id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at",
    )
    .eq("couple_id", currentUser.couple_id)
    .gte("expense_date", monthStart)
    .lt("expense_date", monthEnd);

  if (categoryFilter) {
    allMonthQuery = allMonthQuery.eq("category_id", categoryFilter);
  }

  const { data: allMonthExpenses } = await allMonthQuery.order("expense_date", { ascending: false });

  const typedMembers = (members ?? []) as User[];
  const typedCategories = (categories ?? []) as Category[];
  const typedExpenses = (expenses ?? []) as Expense[];
  const typedAllMonthExpenses = (allMonthExpenses ?? []) as Expense[];
  const totalExpenseCount = expensesCount ?? 0;
  const totalPages = Math.ceil(totalExpenseCount / pageSize);
  const categoryById = new Map(
    typedCategories.map((category) => [category.id, category]),
  );
  const userById = new Map(typedMembers.map((member) => [member.id, member]));
  const currentMember =
    typedMembers.find((member) => member.id === currentUser.id) ??
    (currentUser as User);
  const partner =
    typedMembers.find((member) => member.id !== currentUser.id) ?? null;

  const memberBreakdowns = new Map<string, MemberBreakdown>();
  for (const member of typedMembers) {
    memberBreakdowns.set(member.id, {
      user: member,
      paid: 0,
      responsible: 0,
      personal: 0,
      sharedPaid: 0,
    });
  }

  const splitBreakdowns = new Map<Expense["split_type"], SplitBreakdown>([
    [
      "shared",
      {
        label: "Shared 50/50",
        total: 0,
        count: 0,
        description: "Evenly split between both partners.",
      },
    ],
    [
      "custom",
      {
        label: "Custom split",
        total: 0,
        count: 0,
        description: "Shared expenses with a custom payer ratio.",
      },
    ],
    [
      "personal",
      {
        label: "Personal",
        total: 0,
        count: 0,
        description:
          "Visible for tracking, excluded from partner responsibility.",
      },
    ],
  ]);

  const categoryTotals = new Map<
    string | null,
    {
      name: string;
      icon: string | null;
      total: number;
      myShare: number;
      shared: number;
      personal: number;
      count: number;
    }
  >();

  for (const expense of typedAllMonthExpenses) {
    const amount = Number(expense.amount);
    const payer = expense.user_id
      ? memberBreakdowns.get(expense.user_id)
      : null;
    const otherMember = typedMembers.find(
      (member) => member.id !== expense.user_id,
    );
    const other = otherMember ? memberBreakdowns.get(otherMember.id) : null;
    const { payer: payerShare, partner: partnerShare } = getExpenseShare(expense);
    const split = splitBreakdowns.get(expense.split_type);
    const category = expense.category_id
      ? categoryById.get(expense.category_id)
      : null;
    const categoryKey = expense.category_id ?? null;
    const categoryTotal = categoryTotals.get(categoryKey) ?? {
      name: category?.name ?? "Uncategorized",
      icon: category?.icon ?? null,
      total: 0,
      myShare: 0,
      shared: 0,
      personal: 0,
      count: 0,
    };

    if (payer) {
      payer.paid += amount;
      payer.responsible += payerShare;

      if (expense.split_type === "personal") {
        payer.personal += amount;
      } else {
        payer.sharedPaid += amount;
      }
    }

    if (other) {
      other.responsible += partnerShare;
    }

    if (split) {
      split.total += amount;
      split.count += 1;
    }

    categoryTotal.total += amount;
    categoryTotal.count += 1;
    if (expense.split_type === "personal") {
      categoryTotal.personal += amount;
    } else {
      categoryTotal.shared += amount;
    }

    if (expense.user_id === currentUser.id) {
      categoryTotal.myShare += payerShare;
    } else {
      categoryTotal.myShare += partnerShare;
    }

    categoryTotals.set(categoryKey, categoryTotal);
  }

  const totalSpent = typedAllMonthExpenses.reduce(
    (total, expense) => total + Number(expense.amount),
    0,
  );
  const myPaid = typedAllMonthExpenses
    .filter((expense) => expense.user_id === currentUser.id)
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const sharedTotal = typedAllMonthExpenses
    .filter((expense) => expense.split_type !== "personal")
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const myBreakdown = memberBreakdowns.get(currentUser.id);
  const partnerBreakdown = partner ? memberBreakdowns.get(partner.id) : null;
  const categoryRows = Array.from(categoryTotals.values()).sort(
    (left, right) => right.total - left.total,
  );

  function pageHref(page: number) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (categoryFilter) params.set("category", categoryFilter);
    if (selectedMonth !== getCurrentMonthValue()) params.set("month", selectedMonth);
    return `/expenses?${params.toString()}`;
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br from-card via-card to-primary/5 p-6 sm:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge
                variant="secondary"
                className="gap-1.5 border-primary/20 bg-primary/10 text-primary"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                Expenses
              </Badge>
              <MonthSelector currentMonth={currentMonth} basePath="/expenses" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Granular expense view
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              See what you paid, what you&apos;re responsible for, and how
              personal, shared, and custom splits compare for {monthLabel}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/expenses/new"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
            >
              + Add expense
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total this month</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(totalSpent)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Across {totalExpenseCount} expense
            {totalExpenseCount === 1 ? "" : "s"}.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paid by me</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(myPaid)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cash out from {currentMember.name}.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>My responsibility</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(myBreakdown?.responsible ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Your portion after split rules.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Shared/custom total</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(sharedTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Shared and custom split expenses.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>By person</CardTitle>
            <CardDescription>
              Paid versus responsible amounts for each member.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from(memberBreakdowns.values()).map((member) => {
              const max = Math.max(member.paid, member.responsible, 1);
              const paidPercent = Math.round((member.paid / max) * 100);
              const responsibilityPercent = Math.round(
                (member.responsible / max) * 100,
              );

              return (
                <div
                  key={member.user.id}
                  className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-foreground">
                        {member.user.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Responsible for{" "}
                        {formatCurrency(roundCurrency(member.responsible))}
                      </div>
                    </div>
                    <Badge
                      variant={
                        member.user.id === currentUser.id
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {member.user.id === currentUser.id ? "You" : "Partner"}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Paid</span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(roundCurrency(member.paid))}
                      </span>
                    </div>
                    <Progress value={paidPercent} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Responsible for
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(roundCurrency(member.responsible))}
                      </span>
                    </div>
                    <Progress
                      value={responsibilityPercent}
                      className="h-2 [&>div]:bg-chart-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="text-muted-foreground">Personal paid</div>
                      <div className="font-semibold tabular-nums">
                        {formatCurrency(roundCurrency(member.personal))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="text-muted-foreground">Shared paid</div>
                      <div className="font-semibold tabular-nums">
                        {formatCurrency(roundCurrency(member.sharedPaid))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {!partnerBreakdown ? (
              <p className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                Invite your partner to see two-person responsibility and
                shared expense breakdowns.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By split type</CardTitle>
            <CardDescription>
              Quickly separate personal tracking from shared obligations.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {Array.from(splitBreakdowns.values()).map((split) => {
              const percent =
                totalSpent > 0
                  ? Math.round((split.total / totalSpent) * 100)
                  : 0;

              return (
                <div
                  key={split.label}
                  className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-foreground">
                      {split.label}
                    </h3>
                    <Badge variant="outline">{split.count}</Badge>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    {formatCurrency(roundCurrency(split.total))}
                  </div>
                  <Progress value={percent} className="h-2" />
                  <p className="text-sm text-muted-foreground">
                    {split.description}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Category detail</CardTitle>
              <CardDescription>
                {categoryFilter
                  ? `Filtered to show only "${typedCategories.find((c) => c.id === categoryFilter)?.name ?? "selected"}" expenses.`
                  : "Category totals with your assigned share separated from full spend."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CategoryFilter
            categories={typedCategories}
            selectedId={categoryFilter}
          />
          {categoryRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-3 pr-4 font-medium">Category</th>
                    <th className="py-3 pr-4 font-medium">Total</th>
                    <th className="py-3 pr-4 font-medium">My share</th>
                    <th className="py-3 pr-4 font-medium">Shared/custom</th>
                    <th className="py-3 pr-4 font-medium">Personal</th>
                    <th className="py-3 pr-4 font-medium">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((category) => (
                    <tr
                      key={category.name}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <CategoryIcon icon={category.icon} fallback="💸" />
                          </span>
                          {category.name}
                        </div>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatCurrency(roundCurrency(category.total))}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatCurrency(roundCurrency(category.myShare))}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatCurrency(roundCurrency(category.shared))}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatCurrency(roundCurrency(category.personal))}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {category.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              {categoryFilter ? (
                <>
                  <span className="text-4xl">🔍</span>
                  <p className="text-sm text-muted-foreground">
                    No expenses in{" "}
                    <span className="font-medium text-foreground">
                      {typedCategories.find((c) => c.id === categoryFilter)
                        ?.name ?? "this category"}
                    </span>{" "}
                    this month.
                  </p>
                </>
              ) : (
                <>
                  <span className="text-4xl">🧾</span>
                  <p className="text-sm text-muted-foreground">
                    No expenses recorded this month yet.
                  </p>
                  <Link
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    href="/expenses/new"
                  >
                    Add your first expense →
                  </Link>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Transaction detail</CardTitle>
              <CardDescription>
                {categoryFilter
                  ? `Filtered to show only "${typedCategories.find((c) => c.id === categoryFilter)?.name ?? "selected"}" expenses.`
                  : "Each expense with payer, split type, your share, and partner share."}
              </CardDescription>
            </div>
            <ExportButtons
              expenses={typedAllMonthExpenses.map((e) => {
                const category = e.category_id ? categoryById.get(e.category_id) : null;
                const payer = e.user_id ? userById.get(e.user_id) : null;
                const { payer: payerShare, partner: partnerShare } = getExpenseShare(e);
                const myShare = e.user_id === currentUser.id ? payerShare : partnerShare;
                const otherShare = e.user_id === currentUser.id ? partnerShare : payerShare;
                const otherPayer = partner?.id
                  ? userById.get(partner.id)
                  : null;
                return {
                  id: e.id,
                  expense_date: e.expense_date,
                  description: e.description,
                  category_name: category?.name ?? null,
                  amount: Number(e.amount),
                  split_type: e.split_type,
                  payer_name: payer?.name ?? null,
                  my_share: myShare,
                  partner_share: otherShare,
                  partner_name: otherPayer?.name ?? null,
                };
              })}
              categories={categoryRows.map((r) => ({
                name: r.name,
                total: r.total,
                myShare: r.myShare,
                shared: r.shared,
                personal: r.personal,
                count: r.count,
              }))}
              month={selectedMonth}
            />
          </div>
        </CardHeader>
        <CardContent>
          {typedExpenses.length > 0 ? (
            <div className="space-y-1">
              {typedExpenses.map((expense, index) => {
                const category = expense.category_id
                  ? categoryById.get(expense.category_id)
                  : null;
                const payer = expense.user_id
                  ? userById.get(expense.user_id)
                  : null;
                const { payer: payerShare, partner: partnerShare } = getExpenseShare(expense);
                const myShare =
                  expense.user_id === currentUser.id
                    ? payerShare
                    : partnerShare;
                const otherShare =
                  expense.user_id === currentUser.id
                    ? partnerShare
                    : payerShare;

                return (
                  <div key={expense.id}>
                    <div className="flex flex-col gap-3 rounded-2xl p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <CategoryIcon icon={category?.icon} fallback="💸" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {expense.description ?? category?.name ?? "Expense"}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{formatDate(expense.expense_date)}</span>
                            <span className="opacity-40">·</span>
                            <span className="truncate">
                              {category?.name ?? "Uncategorized"}
                            </span>
                            <Badge
                              variant="outline"
                              className="h-5 border-border/60 px-1.5 text-[10px] font-normal"
                            >
                              {expense.split_type}
                            </Badge>
                            <Badge
                              variant={
                                payer?.id === currentUser.id
                                  ? "secondary"
                                  : "outline"
                              }
                              className="h-5 px-1.5 text-[10px] font-normal"
                            >
                              Paid by{" "}
                              {payer?.id === currentUser.id
                                ? "you"
                                : (payer?.name ?? "unknown")}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:min-w-72 sm:text-right">
                        <div className="sm:text-right">
                          <div className="text-xs text-muted-foreground sm:hidden">
                            Amount
                          </div>
                          <div className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(Number(expense.amount))}
                          </div>
                        </div>
                        <div className="sm:text-right">
                          <div className="text-xs text-muted-foreground sm:hidden">
                            My share
                          </div>
                          <div className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(roundCurrency(myShare))}
                          </div>
                        </div>
                        <div className="sm:text-right">
                          <div className="text-xs text-muted-foreground sm:hidden">
                            {partner?.name ?? "Partner"}
                          </div>
                          <div className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(roundCurrency(otherShare))}
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/expenses/${expense.id}/edit`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground self-start sm:self-center"
                        aria-label="Edit expense"
                      >
                        ✏️
                      </Link>
                    </div>
                    {index < typedExpenses.length - 1 ? <Separator /> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              {categoryFilter ? (
                <>
                  <span className="text-4xl">🔍</span>
                  <p className="text-sm text-muted-foreground">
                    No transactions found for this filter.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No transaction details to show yet.
                </p>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
                {categoryFilter
                  ? ` (filtered)`
                  : ""}
              </p>
              <div className="flex gap-2">
                {currentPage > 1 ? (
                  <Link
                    href={pageHref(currentPage - 1)}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="inline-flex h-9 items-center justify-center rounded-xl border border-border/40 bg-muted/30 px-4 text-sm font-medium text-muted-foreground">
                    ← Previous
                  </span>
                )}
                {currentPage < totalPages ? (
                  <Link
                    href={pageHref(currentPage + 1)}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="inline-flex h-9 items-center justify-center rounded-xl border border-border/40 bg-muted/30 px-4 text-sm font-medium text-muted-foreground">
                    Next →
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
