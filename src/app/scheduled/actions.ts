"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getCurrentUserOrRedirect,
  parseAmount,
  parseNumber,
  parseString,
} from "@/lib/actions";

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

/**
 * Post a scheduled transaction as a real expense on its next_date, then
 * advance next_date to the following occurrence.
 */
export async function postScheduledAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));

  if (!id) redirect("/scheduled?error=invalid_schedule");

  const { data: scheduled, error: fetchError } = await admin
    .from("scheduled_transactions")
    .select(
      "id, couple_id, user_id, category_id, amount, description, split_type, custom_ratio, frequency, frequency_interval, next_date, is_active",
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchError) redirect(`/scheduled?error=${encodeURIComponent(fetchError.message)}`);
  if (!scheduled || scheduled.couple_id !== currentUser.couple_id) {
    redirect("/scheduled?error=schedule_not_found");
  }
  if (!scheduled.is_active) redirect("/scheduled?error=schedule_paused");

  const expenseDate = scheduled.next_date;

  const { error: insertError } = await admin.from("expenses").insert({
    couple_id: currentUser.couple_id,
    user_id: currentUser.id,
    category_id: scheduled.category_id,
    amount: scheduled.amount,
    description: scheduled.description,
    expense_date: expenseDate,
    split_type: scheduled.split_type,
    custom_ratio: scheduled.split_type === "custom" ? scheduled.custom_ratio : null,
  });

  if (insertError) redirect(`/scheduled?error=${encodeURIComponent(insertError.message)}`);

  // Advance next_date to the following occurrence.
  const advanced = advanceDate(
    expenseDate,
    scheduled.frequency,
    scheduled.frequency_interval || 1,
  );
  const { error: updateError } = await admin
    .from("scheduled_transactions")
    .update({ next_date: advanced })
    .eq("id", id)
    .eq("couple_id", currentUser.couple_id);

  if (updateError) redirect(`/scheduled?error=${encodeURIComponent(updateError.message)}`);

  revalidatePath("/scheduled");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/scheduled");
}

/** Advance a YYYY-MM-DD date by one frequency interval (month-safe). */
function advanceDate(
  dateStr: string,
  frequency: string,
  interval: number,
): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (frequency === "weekly") {
    d.setDate(d.getDate() + 7 * interval);
  } else if (frequency === "yearly") {
    d.setFullYear(d.getFullYear() + interval);
  } else {
    // monthly (month-safe: clamp day overflow)
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + interval);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  return d.toISOString().slice(0, 10);
}
