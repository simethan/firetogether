import { redirect } from "next/navigation";
import Link from "next/link";

import { ExpensesContent } from "@/components/expenses/expenses-content";
import { MonthSelector } from "@/components/dashboard/month-selector";
import { Badge } from "@/components/ui/badge";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { getRequestTimeZone } from "@/lib/timezone";
import {
  getCurrentMonthValue,
  formatMonthLabel,
  getMonthStartDate,
  getNextMonthEnd,
} from "@/lib/finance";
import type { Category, Expense, User } from "@/lib/types";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { month: monthParam } = await searchParams;
  const tz = await getRequestTimeZone();
  const rawMonth = typeof monthParam === "string" ? monthParam : null;
  const selectedMonth =
    rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) && rawMonth <= getCurrentMonthValue(tz)
      ? rawMonth
      : getCurrentMonthValue(tz);

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

  const currentMonth = getCurrentMonthValue(tz);
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

  const expensesQuery = admin
    .from("expenses")
    .select(
      "id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at",
    )
    .eq("couple_id", currentUser.couple_id)
    .gte("expense_date", monthStart)
    .lt("expense_date", monthEnd)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  const [{ data: members }, { data: categories }, { data: expenses }] =
    await Promise.all([membersQuery, categoriesQuery, expensesQuery]);

  const typedMembers = (members ?? []) as User[];
  const typedCategories = (categories ?? []) as Category[];
  const typedAllExpenses = (expenses ?? []) as Expense[];
  const currentMember =
    typedMembers.find((member) => member.id === currentUser.id) ??
    (currentUser as User);
  const partner =
    typedMembers.find((member) => member.id !== currentUser.id) ?? null;

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

      <ExpensesContent
        allExpenses={typedAllExpenses}
        categories={typedCategories}
        members={typedMembers}
        currentUser={currentUser as User}
        currentMember={currentMember}
        partner={partner}
        selectedMonth={selectedMonth}
      />
    </div>
  );
}

