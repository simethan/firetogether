"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  SlidersHorizontal,
  User as UserIcon,
  Users,
} from "lucide-react";

import { CategoryIcon } from "@/components/categories/category-icon";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
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
import {
  formatCurrency,
  getShareForExpense as getExpenseShare,
  formatMonthLabel,
  roundCurrency,
} from "@/lib/finance";
import type { Category, Expense, User } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────

type MemberBreakdown = {
  user: User;
  paid: number;
  responsible: number;
  personal: number;
  sharedPaid: number;
};

type CategoryTotal = {
  name: string;
  icon: string | null;
  total: number;
  myShare: number;
  shared: number;
  personal: number;
  count: number;
};

type SplitBreakdown = {
  label: string;
  total: number;
  count: number;
  description: string;
};

type Props = {
  allExpenses: Expense[];
  categories: Category[];
  members: User[];
  currentUser: User;
  currentMember: User;
  partner: User | null;
  selectedMonth: string;
};

// ── Helpers ────────────────────────────────────────────────────

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

// ── Component ──────────────────────────────────────────────────

export function ExpensesContent({
  allExpenses,
  categories,
  members,
  currentUser,
  currentMember,
  partner,
  selectedMonth,
}: Props) {
  const pageSize = 20;
  const monthLabel = formatMonthLabel(selectedMonth);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const userById = new Map(members.map((m) => [m.id, m]));

  // ── Local filter state (no URL round-trips) ──
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [splitFilter, setSplitFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Reset page when filters change
  const filterKey = `${searchQuery}|${categoryFilter ?? ""}|${splitFilter ?? ""}`;

  // ── Derived data ─────────────────────────────────────────────
  const filteredExpenses = useMemo(() => {
    let list = allExpenses;

    if (categoryFilter) {
      list = list.filter((e) => e.category_id === categoryFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          (e.description ?? "").toLowerCase().includes(q) ||
          (categoryById.get(e.category_id ?? "")?.name ?? "")
            .toLowerCase()
            .includes(q),
      );
    }
    if (splitFilter) {
      list = list.filter((e) => e.split_type === splitFilter);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allExpenses, categoryFilter, searchQuery, splitFilter, filterKey]);

  const paginatedExpenses = useMemo(
    () => filteredExpenses.slice(0, page * pageSize),
    [filteredExpenses, page, pageSize],
  );

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  // Reset page when filtered results change
  if (currentPage < page && page > 1) {
    // Will be handled in the next render via the key
  }

  const summary = useMemo(() => {
    const memberBreakdowns = new Map<string, MemberBreakdown>();
    for (const member of members) {
      memberBreakdowns.set(member.id, {
        user: member,
        paid: 0,
        responsible: 0,
        personal: 0,
        sharedPaid: 0,
      });
    }

    const splitBreakdowns = new Map<string, SplitBreakdown>([
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
          description: "Only you see it — no partner split.",
        },
      ],
    ]);

    const categoryTotals = new Map<string | null, CategoryTotal>();

    for (const expense of filteredExpenses) {
      const amount = Number(expense.amount);
      const payer = expense.user_id
        ? memberBreakdowns.get(expense.user_id)
        : null;
      const otherMember = members.find(
        (m) => m.id !== expense.user_id,
      );
      const other = otherMember ? memberBreakdowns.get(otherMember.id) : null;
      const { payer: payerShare, partner: partnerShare } =
        getExpenseShare(expense);
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

    const totalSpent = filteredExpenses.reduce(
      (t, e) => t + Number(e.amount),
      0,
    );
    const myPaid = filteredExpenses
      .filter((e) => e.user_id === currentUser.id)
      .reduce((t, e) => t + Number(e.amount), 0);
    const sharedTotal = filteredExpenses
      .filter((e) => e.split_type !== "personal")
      .reduce((t, e) => t + Number(e.amount), 0);

    const myBreakdown = memberBreakdowns.get(currentUser.id);
    const partnerBreakdown = partner
      ? memberBreakdowns.get(partner.id)
      : null;

    const categoryRows = Array.from(categoryTotals.values()).sort(
      (a, b) => b.total - a.total,
    );

    const splitCounts = {
      shared: splitBreakdowns.get("shared")?.count ?? 0,
      custom: splitBreakdowns.get("custom")?.count ?? 0,
      personal: splitBreakdowns.get("personal")?.count ?? 0,
    };

    return {
      memberBreakdowns,
      splitBreakdowns,
      categoryTotals,
      categoryRows,
      totalSpent,
      myPaid,
      sharedTotal,
      myBreakdown,
      partnerBreakdown,
      splitCounts,
    };
  }, [filteredExpenses, members, currentUser, partner, categoryById]);

  // ── Filter event handlers ────────────────────────────────────

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleCategoryChange = (categoryId: string | null) => {
    setCategoryFilter(categoryId);
    setPage(1);
  };

  const handleSplitChange = (splitType: string | null) => {
    setSplitFilter(splitType);
    setPage(1);
  };

  // Check if any filter is active
  const hasFilters = !!(searchQuery || categoryFilter || splitFilter);

  // ── Render ───────────────────────────────────────────────────

  return (
    <>
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total this month</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(summary.totalSpent)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Across {filteredExpenses.length} expense
            {filteredExpenses.length === 1 ? "" : "s"}
            {hasFilters ? " (filtered)" : ""}.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paid by me</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCurrency(summary.myPaid)}
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
              {formatCurrency(summary.myBreakdown?.responsible ?? 0)}
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
              {formatCurrency(summary.sharedTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Shared and custom split expenses.
          </CardContent>
        </Card>
      </div>

      {/* Breakdowns — stacked, split type below person */}
      <div className="space-y-6">
        {/* By person */}
        <Card>
          <CardHeader>
            <CardTitle>By person</CardTitle>
            <CardDescription>
              Paid versus responsible amounts for each member.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from(summary.memberBreakdowns.values()).map((member) => {
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

            {!summary.partnerBreakdown ? (
              <p className="rounded-xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                Invite your partner to see two-person responsibility and
                shared expense breakdowns.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* By split type */}
        <Card>
          <CardHeader>
            <CardTitle>By split type</CardTitle>
            <CardDescription>
              How expenses break down by sharing rule across the month.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {(["shared", "custom", "personal"] as const).map((type) => {
              const split = summary.splitBreakdowns.get(type);
              if (!split) return null;
              const percent =
                summary.totalSpent > 0
                  ? Math.round((split.total / summary.totalSpent) * 100)
                  : 0;
              const isActive = splitFilter === type;

              const meta =
                type === "shared"
                  ? {
                      icon: Users,
                      iconBg: "bg-emerald-500/10",
                      iconColor: "text-emerald-600",
                      barColor: "bg-emerald-500",
                      ring: "ring-emerald-400/40",
                      borderActive: "border-emerald-400",
                      bgActive: "bg-emerald-50/60",
                    }
                  : type === "custom"
                    ? {
                        icon: SlidersHorizontal,
                        iconBg: "bg-amber-500/10",
                        iconColor: "text-amber-600",
                        barColor: "bg-amber-500",
                        ring: "ring-amber-400/40",
                        borderActive: "border-amber-400",
                        bgActive: "bg-amber-50/60",
                      }
                    : {
                        icon: UserIcon,
                        iconBg: "bg-violet-500/10",
                        iconColor: "text-violet-600",
                        barColor: "bg-violet-500",
                        ring: "ring-violet-400/40",
                        borderActive: "border-violet-400",
                        bgActive: "bg-violet-50/60",
                      };
              const Icon = meta.icon;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    handleSplitChange(isActive ? null : type)
                  }
                  className={`group relative rounded-xl border p-5 text-left transition-all hover:shadow-sm active:scale-[0.97] ${
                    isActive
                      ? `${meta.bgActive} ${meta.borderActive} ring-2 ${meta.ring}`
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  {/* Top: icon + label + active indicator */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.iconBg} ${meta.iconColor}`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {split.label}
                      </span>
                    </div>
                    {isActive && (
                      <span className="shrink-0 text-[10px] font-medium tracking-wider uppercase text-muted-foreground/50">
                        Filtering
                      </span>
                    )}
                  </div>

                  {/* Middle: big amount + percent badge */}
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-bold tabular-nums text-foreground">
                      {formatCurrency(roundCurrency(split.total))}
                    </span>
                    <span className="rounded-md border border-border bg-background px-2 py-0.5 text-[13px] font-semibold tabular-nums text-muted-foreground">
                      {percent}%
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${meta.barColor}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Footer: count */}
                  <div className="mt-2 text-xs text-muted-foreground/70">
                    {split.count} {split.count === 1 ? "entry" : "entries"}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Category detail table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Category detail</CardTitle>
              <CardDescription>
                {hasFilters
                  ? "Filtered view — totals reflect current filters."
                  : "Category totals with your assigned share separated from full spend."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.categoryRows.length > 0 ? (
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
                  {summary.categoryRows.map((category) => (
                    <tr
                      key={category.name}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <CategoryIcon
                              icon={category.icon}
                              fallback="💸"
                            />
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
              {hasFilters ? (
                <>
                  <span className="text-4xl">🔍</span>
                  <p className="text-sm text-muted-foreground">
                    No data for this filter combination this month.
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

      {/* Transaction detail */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Transaction detail</CardTitle>
              <CardDescription>
                {hasFilters
                  ? "Filtered view — transactions matching current filters."
                  : "Each expense with payer, split type, your share, and partner share."}
              </CardDescription>
            </div>
            <ExportButtons
              expenses={filteredExpenses.map((e) => {
                const category = e.category_id
                  ? categoryById.get(e.category_id)
                  : null;
                const payer = e.user_id ? userById.get(e.user_id) : null;
                const { payer: payerShare, partner: partnerShare } =
                  getExpenseShare(e);
                const myShare =
                  e.user_id === currentUser.id ? payerShare : partnerShare;
                const otherShare =
                  e.user_id === currentUser.id ? partnerShare : payerShare;
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
              categories={summary.categoryRows.map((r) => ({
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
        <CardContent className="space-y-4">
          <ExpenseFilters
            categories={categories}
            selectedCategoryId={categoryFilter}
            query={searchQuery}
            splitType={splitFilter ?? ""}
            splitCounts={summary.splitCounts}
            onSearchChange={handleSearchChange}
            onCategoryChange={handleCategoryChange}
            onSplitChange={handleSplitChange}
          />

          {filteredExpenses.length > 0 ? (
            <div className="space-y-1">
              {paginatedExpenses.map((expense, index) => {
                const category = expense.category_id
                  ? categoryById.get(expense.category_id)
                  : null;
                const payer = expense.user_id
                  ? userById.get(expense.user_id)
                  : null;
                const { payer: payerShare, partner: partnerShare } =
                  getExpenseShare(expense);
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
                          <CategoryIcon
                            icon={category?.icon}
                            fallback="💸"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {expense.description ??
                              category?.name ??
                              "Expense"}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>
                              {formatDate(expense.expense_date)}
                            </span>
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
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:min-w-72 sm:text-right">
                        <div className="sm:text-right">
                          <div className="text-xs text-muted-foreground sm:hidden">
                            Total
                          </div>
                          <div className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(Number(expense.amount))}
                          </div>
                          <div className="text-[10px] text-muted-foreground/60">
                            Total
                          </div>
                        </div>
                        <div className="sm:text-right">
                          <div className="text-xs text-muted-foreground sm:hidden">
                            You
                          </div>
                          <div className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(roundCurrency(myShare))}
                          </div>
                          <div className="text-[10px] text-muted-foreground/60">
                            You
                          </div>
                        </div>
                        <div className="sm:text-right">
                          <div className="text-xs text-muted-foreground sm:hidden">
                            {partner?.name ?? "Partner"}
                          </div>
                          <div className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(roundCurrency(otherShare))}
                          </div>
                          <div className="text-[10px] text-muted-foreground/60">
                            Partner
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
                    {index < paginatedExpenses.length - 1 ? (
                      <Separator />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              {hasFilters ? (
                <>
                  <span className="text-4xl">🔍</span>
                  <p className="text-sm text-muted-foreground">
                    No transactions match your filters. Try adjusting the
                    search or clearing some filters.
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
                {hasFilters ? " (filtered)" : ""}
              </p>
              <div className="flex gap-2">
                {currentPage > 1 ? (
                  <button
                    type="button"
                    onClick={() => setPage((p) => p - 1)}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    ← Previous
                  </button>
                ) : (
                  <span className="inline-flex h-9 items-center justify-center rounded-xl border border-border/40 bg-muted/30 px-4 text-sm font-medium text-muted-foreground">
                    ← Previous
                  </span>
                )}
                {currentPage < totalPages ? (
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Next →
                  </button>
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
    </>
  );
}
