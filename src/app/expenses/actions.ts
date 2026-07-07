"use server";

import type { ExpenseFormState } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getCurrentUserOrRedirect,
  parseNumber,
  parseString,
} from "@/lib/actions";

export async function updateExpenseAction(
  _previousState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const { currentUser, admin } = await getCurrentUserOrRedirect();

  const expenseId = parseString(formData.get("expense_id"));
  const amount = parseNumber(formData.get("amount"));
  const expenseDate = parseString(formData.get("expense_date"));
  const description = parseString(formData.get("description"));
  const categoryId = parseString(formData.get("category_id"));
  const splitType = parseString(formData.get("split_type"));
  const customRatio = parseNumber(formData.get("custom_ratio"));

  if (!expenseId) {
    return { error: "Missing expense ID." };
  }

  if (!amount || amount <= 0) {
    return { error: "Enter a valid amount greater than zero." };
  }

  if (!expenseDate) {
    return { error: "Choose an expense date." };
  }

  if (
    splitType !== "personal" &&
    splitType !== "shared" &&
    splitType !== "custom"
  ) {
    return { error: "Choose a valid split type." };
  }

  if (
    splitType === "custom" &&
    (customRatio === null || customRatio <= 0 || customRatio > 1)
  ) {
    return {
      error: "Custom split ratio must be a decimal between 0 and 1.",
    };
  }

  // Verify the expense belongs to this couple
  const { data: existing } = await admin
    .from("expenses")
    .select("id, couple_id")
    .eq("id", expenseId)
    .maybeSingle();

  if (!existing || existing.couple_id !== currentUser.couple_id) {
    return { error: "Expense not found or you don't have permission to edit it." };
  }

  if (categoryId) {
    const { data: category } = await admin
      .from("categories")
      .select("id, couple_id")
      .eq("id", categoryId)
      .maybeSingle();

    if (!category || category.couple_id !== currentUser.couple_id) {
      return { error: "Choose a category from your couple's list." };
    }
  }

  const { error: updateError } = await admin
    .from("expenses")
    .update({
      category_id: categoryId,
      amount,
      description,
      expense_date: expenseDate,
      split_type: splitType,
      custom_ratio: splitType === "custom" ? customRatio : null,
    })
    .eq("id", expenseId);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/expenses?expense=updated");
}

export async function deleteExpenseAction(
  _previousState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const { currentUser, admin } = await getCurrentUserOrRedirect();

  const expenseId = parseString(formData.get("expense_id"));

  if (!expenseId) {
    return { error: "Missing expense ID." };
  }

  // Verify the expense belongs to this couple
  const { data: existing } = await admin
    .from("expenses")
    .select("id, couple_id")
    .eq("id", expenseId)
    .maybeSingle();

  if (!existing || existing.couple_id !== currentUser.couple_id) {
    return { error: "Expense not found or you don't have permission to delete it." };
  }

  const { error: deleteError } = await admin
    .from("expenses")
    .delete()
    .eq("id", expenseId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/expenses?expense=deleted");
}
