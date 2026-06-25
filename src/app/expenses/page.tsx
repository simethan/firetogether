import { redirect } from "next/navigation";
import Link from "next/link";

import { CategoryIcon } from "@/components/categories/category-icon";
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
  getMonthStartDate,
} from "@/lib/finance";
import type { Category, Expense, User } from "@/lib/types";

type ExpenseShare = {
  payerShare: number;
  partnerShare: number;
};

type MemberBreakdown = {
  user: User;
  paid: number;
  responsible: number;
  personal: number;
  sharedPaid: number;
  net: number;
};

type SplitBreakdown = {
  label: string;
  total: number;
  count: number;
  description: string;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getExpenseShare(expense: Expense): ExpenseShare {
  const amount = Number(expense.amount);

  if (expense.split_type === "personal") {
    return { payerShare: amount, partnerShare: 0 };
  }

  if (expense.split_type === "custom") {
    const payerRatio =
      typeof expense.custom_ratio === "number" ? expense.custom_ratio : 0.5;
    const payerShare = amount * payerRatio;
    return { payerShare, partnerShare: amount - payerShare };
  }

  return { payerShare: amount / 2, partnerShare: amount / 2 };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default async function ExpensesPage() {
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
  const currentMonthStart = getMonthStartDate(currentMonth);

  const [{ data: members }, { data: categories }, { data: expenses }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, couple_id, email, name, created_at")
        .eq("couple_id", currentUser.couple_id)
        .order("created_at", { ascending: true }),
      admin
        .from("categories")
        .select("id, couple_id, name, icon, is_default, created_at")
        .eq("couple_id", currentUser.couple_id)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true }),
      admin
        .from("expenses")
        .select(
          "id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at",
        )
        .eq("couple_id", currentUser.couple_id)
        .gte("expense_date", currentMonthStart)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  const typedMembers = (members ?? []) as User[];
  const typedCategories = (categories ?? []) as Category[];
  const typedExpenses = (expenses ?? []) as Expense[];
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
      net: 0,
    });
  }

  const splitBreakdowns = new Map<Expense["split_type"], SplitBreakdown>([
    [
      "shared",
      {
        label: "Shared 50/50",
        total: 0,
        count: 0,
        description: "Even split expenses that affect settle-up.",
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

  for (const expense of typedExpenses) {
    const amount = Number(expense.amount);
    const payer = expense.user_id
      ? memberBreakdowns.get(expense.user_id)
      : null;
    const otherMember = typedMembers.find(
      (member) => member.id !== expense.user_id,
    );
    const other = otherMember ? memberBreakdowns.get(otherMember.id) : null;
    const { payerShare, partnerShare } = getExpenseShare(expense);
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
      payer.net += amount - payerShare;

      if (expense.split_type === "personal") {
        payer.personal += amount;
      } else {
        payer.sharedPaid += amount;
      }
    }

    if (other) {
      other.responsible += partnerShare;
      other.net -= partnerShare;
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

  const totalSpent = typedExpenses.reduce(
    (total, expense) => total + Number(expense.amount),
    0,
  );
  const myPaid = typedExpenses
    .filter((expense) => expense.user_id === currentUser.id)
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const sharedTotal = typedExpenses
    .filter((expense) => expense.split_type !== "personal")
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const myBreakdown = memberBreakdowns.get(currentUser.id);
  const partnerBreakdown = partner ? memberBreakdowns.get(partner.id) : null;
  const categoryRows = Array.from(categoryTotals.values()).sort(
    (left, right) => right.total - left.total,
  );

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br from-card via-card to-primary/5 p-6 shadow-lg shadow-orange-500/5 sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <Badge
              variant="secondary"
              className="gap-1.5 border-primary/20 bg-primary/10 text-primary"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              Expenses
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Granular expense view
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              See what you paid, what you&apos;re responsible for, and how
              personal, shared, and custom splits compare for {currentMonth}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/expenses/new"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.97]"
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
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Total this month</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(totalSpent)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Across {typedExpenses.length} expense
            {typedExpenses.length === 1 ? "" : "s"}.
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
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
        <Card className="border-border/60 shadow-sm">
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
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Shared/custom total</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(sharedTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Expenses that affect settle-up.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
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
                        Net {member.net >= 0 ? "ahead" : "behind"} by{" "}
                        {formatCurrency(Math.abs(roundCurrency(member.net)))}
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
                settle-up comparisons.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle>By split type</CardTitle>
            <CardDescription>
              Quickly separate personal tracking from shared obligations.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
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

      <Card className="border-border/60 shadow-lg shadow-orange-500/5">
        <CardHeader>
          <CardTitle>Category detail</CardTitle>
          <CardDescription>
            Category totals with your assigned share separated from full spend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoryRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 text-sm">
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
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-lg shadow-orange-500/5">
        <CardHeader>
          <CardTitle>Transaction detail</CardTitle>
          <CardDescription>
            Each expense with payer, split type, your share, and partner share.
          </CardDescription>
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
                const { payerShare, partnerShare } = getExpenseShare(expense);
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
                    <div className="grid gap-3 rounded-2xl p-3 transition-colors hover:bg-muted/40 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <CategoryIcon icon={category?.icon} fallback="💸" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {expense.description ?? category?.name ?? "Expense"}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{formatDate(expense.expense_date)}</span>
                            <span className="opacity-40">·</span>
                            <span>{category?.name ?? "Uncategorized"}</span>
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

                      <div className="grid grid-cols-3 gap-2 text-right text-sm md:min-w-85">
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Amount
                          </div>
                          <div className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(Number(expense.amount))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">
                            My share
                          </div>
                          <div className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(roundCurrency(myShare))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">
                            {partner?.name ?? "Partner"}
                          </div>
                          <div className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(roundCurrency(otherShare))}
                          </div>
                        </div>
                      </div>
                    </div>
                    {index < typedExpenses.length - 1 ? <Separator /> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No transaction details to show yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
