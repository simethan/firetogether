"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { getMonthStartDate } from "@/lib/finance";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function parseAmount(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMonth(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return null;
  return getMonthStartDate(trimmed);
}

function parseString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

export async function createIncomeAction(formData: FormData): Promise<void> {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const amount = parseAmount(formData.get("amount"));
  const source = parseString(formData.get("source"));
  const incomeDate = parseString(formData.get("income_date"));

  if (!amount || amount <= 0) {
    redirect("/income?error=Enter%20a%20valid%20income%20amount.");
  }

  if (!source) {
    redirect("/income?error=Enter%20a%20source%20for%20this%20income.");
  }

  const date = incomeDate ?? new Date().toISOString().slice(0, 10);

  const { error } = await admin.from("income").insert({
    couple_id: currentUser.couple_id,
    user_id: currentUser.id,
    amount,
    source,
    income_date: date,
  });

  if (error) {
    redirect(`/income?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/income");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/income");
}

export async function deleteIncomeAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));

  if (!id) {
    redirect("/income?error=invalid_income_delete");
  }

  const { data: income } = await admin
    .from("income")
    .select("id, couple_id")
    .eq("id", id)
    .maybeSingle();

  if (!income || income.couple_id !== currentUser.couple_id) {
    redirect("/income?error=income_not_found");
  }

  const { error } = await admin.from("income").delete().eq("id", id);

  if (error) {
    redirect(`/income?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/income");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/income");
}
