"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function parseAmount(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDate(value: FormDataEntryValue | null) {
  const parsed = parseString(value);
  if (!parsed) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : null;
}

async function getCurrentUserOrRedirect() {
  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) {
    redirect("/onboarding");
  }

  return { authUserId, currentUser, admin } as const;
}

export async function createGoalAction(formData: FormData): Promise<void> {
  const { authUserId, currentUser, admin } = await getCurrentUserOrRedirect();
  const name = parseString(formData.get("name"));
  const targetAmount = parseAmount(formData.get("target_amount"));
  const currentAmount = parseAmount(formData.get("current_amount")) ?? 0;
  const deadline = parseDate(formData.get("deadline"));
  const icon = parseString(formData.get("icon"));
  const isShared = formData.has("is_shared");

  if (!name) {
    redirect("/goals?error=Enter%20a%20goal%20name.");
  }

  if (!targetAmount || targetAmount <= 0) {
    redirect("/goals?error=Enter%20a%20valid%20target%20amount.");
  }

  if (currentAmount < 0) {
    redirect("/goals?error=Enter%20a%20valid%20current%20amount.");
  }

  const { error } = await admin.from("savings_goals").insert({
    couple_id: currentUser.couple_id,
    created_by: authUserId,
    name,
    target_amount: targetAmount,
    current_amount: currentAmount,
    deadline,
    is_shared: isShared,
    icon,
  });

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  redirect("/goals");
}

export async function updateGoalAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));
  const name = parseString(formData.get("name"));
  const targetAmount = parseAmount(formData.get("target_amount"));
  const currentAmount = parseAmount(formData.get("current_amount"));
  const deadline = parseDate(formData.get("deadline"));
  const icon = parseString(formData.get("icon"));
  const isShared = formData.has("is_shared");

  if (
    !id ||
    !name ||
    !targetAmount ||
    targetAmount <= 0 ||
    currentAmount === null ||
    currentAmount < 0
  ) {
    redirect("/goals?error=invalid_goal_update");
  }

  const { data: goal } = await admin
    .from("savings_goals")
    .select("id, couple_id")
    .eq("id", id)
    .maybeSingle();

  if (!goal || goal.couple_id !== currentUser.couple_id) {
    redirect("/goals?error=goal_not_found");
  }

  const { error } = await admin
    .from("savings_goals")
    .update({
      name,
      target_amount: targetAmount,
      current_amount: currentAmount,
      deadline,
      icon,
      is_shared: isShared,
    })
    .eq("id", id);

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  redirect("/goals");
}

export async function addFundsAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));
  const amount = parseAmount(formData.get("amount"));

  if (!id || !amount || amount <= 0) {
    redirect("/goals?error=invalid_funds_addition");
  }

  const { data: goal } = await admin
    .from("savings_goals")
    .select("id, couple_id, current_amount")
    .eq("id", id)
    .maybeSingle();

  if (!goal || goal.couple_id !== currentUser.couple_id) {
    redirect("/goals?error=goal_not_found");
  }

  const nextAmount = Number(goal.current_amount) + amount;
  const { error } = await admin
    .from("savings_goals")
    .update({ current_amount: nextAmount })
    .eq("id", id);

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  redirect("/goals");
}

export async function deleteGoalAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));

  if (!id) {
    redirect("/goals?error=invalid_goal_delete");
  }

  const { data: goal } = await admin
    .from("savings_goals")
    .select("id, couple_id")
    .eq("id", id)
    .maybeSingle();

  if (!goal || goal.couple_id !== currentUser.couple_id) {
    redirect("/goals?error=goal_not_found");
  }

  const { error } = await admin.from("savings_goals").delete().eq("id", id);

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/goals");
  revalidatePath("/dashboard");
  redirect("/goals");
}
