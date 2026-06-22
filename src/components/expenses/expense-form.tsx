"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createExpenseAction,
  initialExpenseFormState,
  type ExpenseFormState,
} from "@/app/expenses/new/actions";
import type { Category } from "@/lib/types";

function ErrorMessage({ state }: { state: ExpenseFormState }) {
  if (!state.error) {
    return <p className="text-sm text-muted-foreground">Add the expense details below and save it to your couple.</p>;
  }

  return <p className="text-sm text-destructive">{state.error}</p>;
}

export function ExpenseForm({ categories }: { categories: Category[] }) {
  const [state, action, pending] = useActionState(createExpenseAction, initialExpenseFormState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card className="w-full max-w-2xl border-border/60 shadow-lg shadow-orange-500/5">
      <CardHeader>
        <CardTitle className="text-2xl">New expense</CardTitle>
        <CardDescription>
          Record a shared or personal expense for your couple workspace.
        </CardDescription>
      </CardHeader>
      <form action={action}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" name="amount" type="number" min="0.01" step="0.01" placeholder="42.50" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense_date">Date</Label>
            <Input id="expense_date" name="expense_date" type="date" defaultValue={today} required />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" placeholder="Dinner at Maple House" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category_id">Category</Label>
            <select
              id="category_id"
              name="category_id"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              defaultValue=""
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="split_type">Split type</Label>
            <select
              id="split_type"
              name="split_type"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              defaultValue="shared"
            >
              <option value="shared">Shared</option>
              <option value="personal">Personal</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="custom_ratio">Custom ratio</Label>
            <Input id="custom_ratio" name="custom_ratio" type="number" min="0" max="1" step="0.01" placeholder="0.60" />
            <p className="text-sm text-muted-foreground">
              Use a decimal between 0 and 1 only when the split type is custom.
            </p>
          </div>

          <div className="sm:col-span-2">
            <ErrorMessage state={state} />
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Saved expenses will show up on the dashboard.</p>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save expense"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}