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
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getCurrentUserOrRedirect() {
  const authUserId = await getAuthUserId();
  if (!authUserId) redirect("/login");

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) redirect("/onboarding");

  return { authUserId, currentUser, admin } as const;
}

export async function createScheduledAction(formData: FormData): Promise<void> {
  const { currentUser, admin } = await getCurrentUserOrRedirect();

  const amount = parseAmount(formData.get("amount"));
  const description = parseString(formData.get("description"));
  const categoryId = parseString(formData.get("category_id"));
  const splitType = parseString(formData.get("split_type"));
  const customRatio = parseNumber(formData.get("custom_ratio"));
  const frequency = parseString(formData.get("frequency"));
  const frequencyInterval = parseNumber(formData.get("frequency_interval"));
  const nextDate = parseString(formData.get("next_date"));
  const endDate = parseString(formData.get("end_date"));

  if (!amount || amount <= 0) {
    redirect("/scheduled?error=Enter%20a%20valid%20amount.");
  }

  if (!nextDate) {
    redirect("/scheduled?error=Choose%20a%20next%20date.");
  }

  if (splitType !== "personal" && splitType !== "shared" && splitType !== "custom") {
    redirect("/scheduled?error=Choose%20a%20valid%20split%20type.");
  }

  const { error } = await admin.from("scheduled_transactions").insert({
    couple_id: currentUser.couple_id,
    user_id: currentUser.id,
    category_id: categoryId ?? null,
    amount,
    description: description ?? null,
    split_type: splitType,
    custom_ratio: splitType === "custom" ? customRatio : null,
    frequency: frequency ?? "monthly",
    frequency_interval: frequencyInterval ?? 1,
    next_date: nextDate,
    end_date: endDate ?? null,
  });

  if (error) {
    redirect(`/scheduled?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/scheduled");
  revalidatePath("/dashboard");
  redirect("/scheduled");
}

export async function toggleScheduledAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));

  if (!id) redirect("/scheduled?error=invalid_toggle");

  const { data: scheduled } = await admin
    .from("scheduled_transactions")
    .select("id, couple_id, is_active")
    .eq("id", id)
    .maybeSingle();

  if (!scheduled || scheduled.couple_id !== currentUser.couple_id) {
    redirect("/scheduled?error=scheduled_not_found");
  }

  const { error } = await admin
    .from("scheduled_transactions")
    .update({ is_active: !scheduled.is_active })
    .eq("id", id);

  if (error) redirect(`/scheduled?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/scheduled");
  revalidatePath("/dashboard");
  redirect("/scheduled");
}

export async function deleteScheduledAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));

  if (!id) redirect("/scheduled?error=invalid_delete");

  const { data: scheduled } = await admin
    .from("scheduled_transactions")
    .select("id, couple_id")
    .eq("id", id)
    .maybeSingle();

  if (!scheduled || scheduled.couple_id !== currentUser.couple_id) {
    redirect("/scheduled?error=scheduled_not_found");
  }

  const { error } = await admin
    .from("scheduled_transactions")
    .delete()
    .eq("id", id);

  if (error) redirect(`/scheduled?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/scheduled");
  revalidatePath("/dashboard");
  redirect("/scheduled");
}
