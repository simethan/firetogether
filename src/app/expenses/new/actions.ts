"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ExpenseFormState = {
  error: string | null;
};

export const initialExpenseFormState: ExpenseFormState = {
  error: null,
};

function parseNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export async function createExpenseAction(
  _previousState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();

  const { data: currentUser, error: userError } = await admin
    .from("users")
    .select("id, couple_id, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (userError) {
    return { error: userError.message };
  }

  if (!currentUser?.couple_id) {
    redirect("/onboarding");
  }

  const amount = parseNumber(formData.get("amount"));
  const expenseDate = parseString(formData.get("expense_date"));
  const description = parseString(formData.get("description"));
  const categoryId = parseString(formData.get("category_id"));
  const splitType = parseString(formData.get("split_type"));
  const customRatio = parseNumber(formData.get("custom_ratio"));

  if (!amount || amount <= 0) {
    return { error: "Enter a valid amount greater than zero." };
  }

  if (!expenseDate) {
    return { error: "Choose an expense date." };
  }

  if (splitType !== "personal" && splitType !== "shared" && splitType !== "custom") {
    return { error: "Choose a valid split type." };
  }

  if (splitType === "custom" && (customRatio === null || customRatio <= 0 || customRatio > 1)) {
    return { error: "Custom split ratio must be a decimal between 0 and 1." };
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

  const { error: insertError } = await admin.from("expenses").insert({
    couple_id: currentUser.couple_id,
    user_id: currentUser.id,
    category_id: categoryId,
    amount,
    description,
    expense_date: expenseDate,
    split_type: splitType,
    custom_ratio: splitType === "custom" ? customRatio : null,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?expense=created");
}