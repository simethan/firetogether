import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/admin";
import { getRequestTimeZone } from "@/lib/timezone";
import {
  calculateDashboardSummary,
  formatCurrency,
  getCurrentMonthValue,
  getMonthStartDate,
} from "@/lib/finance";
import type { Budget, Category, Expense, User } from "@/lib/types";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function formatMonthLabel(monthValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthValue}-01T00:00:00`));
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const receivedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!receivedToken) {
    return unauthorized("Missing shortcut token.");
  }

  const admin = createServiceClient();
  const { data: user, error: userError } = await admin
    .from("users")
    .select("id, couple_id, email, name, shortcut_token, created_at")
    .eq("shortcut_token", receivedToken)
    .maybeSingle();

  if (userError) {
    return badRequest(userError.message);
  }

  if (!user?.couple_id) {
    return unauthorized("Invalid shortcut token.");
  }

  const tz = await getRequestTimeZone();
  const currentMonth = getCurrentMonthValue(tz);
  const currentMonthStart = getMonthStartDate(currentMonth);

  const [{ data: members }, { data: categories }, { data: expenses }, { data: budgets }] = await Promise.all([
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
      .select("id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at")
      .eq("couple_id", user.couple_id)
      .gte("expense_date", currentMonthStart)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    admin
      .from("budgets")
      .select("id, couple_id, category_id, month, amount")
      .eq("couple_id", user.couple_id)
      .eq("month", currentMonthStart),
  ]);

  const typedMembers = (members ?? []) as User[];
  const typedCategories = (categories ?? []) as Category[];
  const typedExpenses = (expenses ?? []) as Expense[];
  const typedBudgets = (budgets ?? []) as Budget[];
  const categoryById = new Map(typedCategories.map((category) => [category.id, category]));
  const userById = new Map(typedMembers.map((member) => [member.id, member]));

  const summary = calculateDashboardSummary({
    expenses: typedExpenses.map((expense) => ({
      ...expense,
      categories: categoryById.get(expense.category_id ?? "") ?? undefined,
      users: userById.get(expense.user_id ?? "") ?? undefined,
    })),
    users: typedMembers,
    budgets: typedBudgets,
    categories: typedCategories,
  });

  const mySpend = typedExpenses
    .filter((expense) => expense.user_id === user.id)
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const myPersonalSpend = typedExpenses
    .filter((expense) => expense.user_id === user.id && expense.split_type === "personal")
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const overallBudget = typedBudgets.find((budget) => budget.category_id === null) ?? null;
  const overallBudgetAmount = overallBudget ? Number(overallBudget.amount) : null;
  const budgetRemaining = overallBudgetAmount === null ? null : overallBudgetAmount - mySpend;
  const topCategory = summary.categorySummaries[0] ?? null;

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    user: {
      id: user.id,
      name: user.name,
    },
    month: {
      value: currentMonth,
      label: formatMonthLabel(currentMonth),
    },
    spend: {
      overall: summary.totalSpent,
      overall_formatted: formatCurrency(summary.totalSpent),
      mine: mySpend,
      mine_formatted: formatCurrency(mySpend),
      my_personal: myPersonalSpend,
      my_personal_formatted: formatCurrency(myPersonalSpend),
      shared: summary.sharedSpent,
      shared_formatted: formatCurrency(summary.sharedSpent),
    },
    budget: {
      amount: overallBudgetAmount,
      amount_formatted: overallBudgetAmount === null ? null : formatCurrency(overallBudgetAmount),
      remaining: budgetRemaining,
      remaining_formatted: budgetRemaining === null ? null : formatCurrency(budgetRemaining),
      percent: overallBudgetAmount ? Math.min(100, Math.round((mySpend / overallBudgetAmount) * 100)) : null,
    },
    personal: {
      amount: summary.personalSpent,
      amount_formatted: formatCurrency(summary.personalSpent),
    },
    top_category: topCategory
      ? {
          name: topCategory.name,
          amount: topCategory.amount,
          amount_formatted: formatCurrency(topCategory.amount),
        }
      : null,
  });
}
