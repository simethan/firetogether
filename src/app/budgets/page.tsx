import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { formatCurrency, getCurrentMonthValue } from "@/lib/finance";
import type { Budget, Category, Expense } from "@/lib/types";
import { createBudgetAction, deleteBudgetAction, updateBudgetAction } from "./actions";

function ErrorBanner({ searchParams }: { searchParams: { error?: string } }) {
  if (!searchParams.error) {
    return null;
  }

  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {decodeURIComponent(searchParams.error)}
    </div>
  );
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
  const currentMonthStart = `${currentMonth}-01`;

  const [{ data: categories }, { data: budgets }, { data: expenses }] = await Promise.all([
    admin.from("categories").select("id, couple_id, name, icon, is_default, created_at").eq("couple_id", currentUser.couple_id).order("is_default", { ascending: false }).order("name", { ascending: true }),
    admin.from("budgets").select("id, couple_id, category_id, month, amount").eq("couple_id", currentUser.couple_id).eq("month", currentMonthStart).order("amount", { ascending: false }),
    admin.from("expenses").select("id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at").eq("couple_id", currentUser.couple_id).gte("expense_date", currentMonthStart),
  ]);

  const typedCategories = (categories ?? []) as Category[];
  const typedBudgets = (budgets ?? []) as Budget[];
  const typedExpenses = (expenses ?? []) as Expense[];

  const spendByCategory = new Map<string | null, number>();

  for (const expense of typedExpenses) {
    if (expense.split_type === "personal") {
      continue;
    }

    const key = expense.category_id ?? null;
    spendByCategory.set(key, (spendByCategory.get(key) ?? 0) + Number(expense.amount));
  }

  const overallSpend = Array.from(spendByCategory.values()).reduce((total, amount) => total + amount, 0);
  const overallBudget = typedBudgets.find((budget) => budget.category_id === null) ?? null;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-lg shadow-orange-500/5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Badge variant="secondary" className="w-fit">Budgets</Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{currentMonth} budget view</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Track how each category is performing this month and keep an overall ceiling for the couple.
          </p>
        </div>
      </div>

      <ErrorBanner searchParams={resolvedSearchParams} />

      <Card className="border-border/60 shadow-lg shadow-orange-500/5">
        <CardHeader>
          <CardTitle>Create budget</CardTitle>
          <CardDescription>Add an overall budget or a category-specific monthly limit.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createBudgetAction} className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
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

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" name="amount" type="number" min="0.01" step="0.01" placeholder="500" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Input id="month" name="month" type="month" defaultValue={currentMonth} required />
            </div>

            <div className="md:col-span-4">
              <Button type="submit">Save budget</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle>Overall spend</CardTitle>
            <CardDescription>Couple-wide spending compared with the overall budget.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Spent</span>
              <span className="font-medium text-foreground">{formatCurrency(overallSpend)}</span>
            </div>
            <Progress value={overallBudget ? Math.min(100, Math.round((overallSpend / Number(overallBudget.amount)) * 100)) : 0} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Budget</span>
              <span className="font-medium text-foreground">{overallBudget ? formatCurrency(Number(overallBudget.amount)) : "No overall budget set"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle>Monthly budgets</CardTitle>
            <CardDescription>Update amounts or remove a budget whenever plans change.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {typedBudgets.length > 0 ? (
              typedBudgets.map((budget, index) => {
                const category = budget.category_id ? typedCategories.find((entry) => entry.id === budget.category_id) : null;
                const spent = spendByCategory.get(budget.category_id ?? null) ?? 0;
                const progress = Math.min(100, Math.round((spent / Number(budget.amount)) * 100));

                return (
                  <div key={budget.id}>
                    <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-foreground">{category?.name ?? "Overall budget"}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatCurrency(spent)} spent of {formatCurrency(Number(budget.amount))}
                          </div>
                        </div>
                        <Badge variant={progress >= 100 ? "destructive" : "secondary"}>
                          {progress}%
                        </Badge>
                      </div>
                      <Progress value={progress} />

                      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                        <form action={updateBudgetAction} className="flex gap-2">
                          <input type="hidden" name="id" value={budget.id} />
                          <Input name="amount" type="number" min="0.01" step="0.01" defaultValue={Number(budget.amount)} />
                          <Button type="submit" variant="outline">Save</Button>
                        </form>

                        <form action={deleteBudgetAction}>
                          <input type="hidden" name="id" value={budget.id} />
                          <Button type="submit" variant="destructive">Delete</Button>
                        </form>
                      </div>
                    </div>

                    {index < typedBudgets.length - 1 ? <Separator className="my-4" /> : null}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No budgets set for this month yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}