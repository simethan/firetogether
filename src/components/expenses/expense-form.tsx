"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createExpenseAction,
} from "@/app/expenses/new/actions";
import {
  updateExpenseAction,
  deleteExpenseAction,
} from "@/app/expenses/actions";
import type { Category, Expense, ExpenseFormState } from "@/lib/types";
import { initialExpenseFormState } from "@/lib/types";

function ErrorMessage({ state }: { state: ExpenseFormState }) {
  if (!state.error) {
    return <p className="text-sm text-muted-foreground">Add the expense details below and save it to your couple.</p>;
  }

  return <p className="text-sm text-destructive">{state.error}</p>;
}

type ExpenseFormProps = {
  categories: Category[];
  expense?: Expense;
};

export function ExpenseForm({ categories, expense }: ExpenseFormProps) {
  const isEditing = !!expense;
  const action = isEditing ? updateExpenseAction : createExpenseAction;
  const [state, formAction, pending] = useActionState(action, initialExpenseFormState);
  const today = new Date().toISOString().slice(0, 10);

  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteExpenseAction,
    initialExpenseFormState
  );

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl">{isEditing ? "Edit expense" : "New expense"}</CardTitle>
        <CardDescription>
          {isEditing
            ? "Update the expense details below."
            : "Record a shared or personal expense for your couple workspace."}
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        {isEditing && (
          <input type="hidden" name="expense_id" value={expense!.id} />
        )}
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="42.50"
              required
              defaultValue={isEditing ? expense!.amount : undefined}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense_date">Date</Label>
            <Input
              id="expense_date"
              name="expense_date"
              type="date"
              defaultValue={isEditing ? expense!.expense_date : today}
              required
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              placeholder="Dinner at Maple House"
              defaultValue={isEditing ? expense!.description ?? "" : undefined}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category_id">Category</Label>
            <select
              id="category_id"
              name="category_id"
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              defaultValue={isEditing ? expense!.category_id ?? "" : ""}
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
              defaultValue={isEditing ? expense!.split_type : "shared"}
            >
              <option value="shared">Shared</option>
              <option value="personal">Personal</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="custom_ratio">Custom ratio</Label>
            <Input
              id="custom_ratio"
              name="custom_ratio"
              type="number"
              min="0"
              max="1"
              step="0.01"
              placeholder="0.60"
              defaultValue={isEditing ? expense!.custom_ratio ?? undefined : undefined}
            />
            <p className="text-sm text-muted-foreground">
              Use a decimal between 0 and 1 only when the split type is custom.
            </p>
          </div>

          <div className="sm:col-span-2">
            <ErrorMessage state={state} />
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {isEditing
              ? "Changes will update the expense immediately."
              : "Saved expenses will show up on the dashboard."}
          </p>
          <div className="flex items-center gap-2">
            {isEditing && (
              <Button
                type="submit"
                formAction={deleteAction}
                variant="destructive"
                disabled={deletePending}
              >
                {deletePending ? "Deleting..." : "Delete"}
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving..."
                : isEditing
                  ? "Update expense"
                  : "Save expense"}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}