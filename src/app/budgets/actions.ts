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
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    return null;
  }

  return getMonthStartDate(trimmed);
}

function parseString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

export async function createBudgetAction(formData: FormData): Promise<void> {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const amount = parseAmount(formData.get("amount"));
  const month = parseMonth(formData.get("month"));
  const categoryId = parseString(formData.get("category_id"));

  if (!amount || amount <= 0) {
    redirect("/budgets?error=Enter%20a%20valid%20budget%20amount.");
  }

  if (!month) {
    redirect("/budgets?error=Choose%20a%20valid%20month.");
  }

  if (categoryId) {
    const { data: category } = await admin
      .from("categories")
      .select("id, couple_id")
      .eq("id", categoryId)
      .maybeSingle();

    if (!category || category.couple_id !== currentUser.couple_id) {
      redirect(
        "/budgets?error=Choose%20a%20category%20from%20your%20couple%27s%20list.",
      );
    }
  }

  if (categoryId) {
    const { error } = await admin.from("budgets").upsert(
      {
        couple_id: currentUser.couple_id,
        category_id: categoryId,
        month,
        amount,
      },
      { onConflict: "couple_id,category_id,month" },
    );

    if (error) {
      redirect(`/budgets?error=${encodeURIComponent(error.message)}`);
    }
  } else {
    const { data: existing } = await admin
      .from("budgets")
      .select("id")
      .eq("couple_id", currentUser.couple_id)
      .is("category_id", null)
      .eq("month", month)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("budgets")
        .update({ amount })
        .eq("id", existing.id);

      if (error) {
        redirect(`/budgets?error=${encodeURIComponent(error.message)}`);
      }
    } else {
      const { error } = await admin.from("budgets").insert({
        couple_id: currentUser.couple_id,
        category_id: null,
        month,
        amount,
      });

      if (error) {
        redirect(`/budgets?error=${encodeURIComponent(error.message)}`);
      }
    }
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/budgets");
}

export async function updateBudgetAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));
  const amount = parseAmount(formData.get("amount"));

  if (!id || !amount || amount <= 0) {
    redirect("/budgets?error=invalid_budget_update");
  }

  const { data: budget } = await admin
    .from("budgets")
    .select("id, couple_id")
    .eq("id", id)
    .maybeSingle();

  if (!budget || budget.couple_id !== currentUser.couple_id) {
    redirect("/budgets?error=budget_not_found");
  }

  const { error } = await admin.from("budgets").update({ amount }).eq("id", id);

  if (error) {
    redirect(`/budgets?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/budgets");
}

export async function deleteBudgetAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));

  if (!id) {
    redirect("/budgets?error=invalid_budget_delete");
  }

  const { data: budget } = await admin
    .from("budgets")
    .select("id, couple_id")
    .eq("id", id)
    .maybeSingle();

  if (!budget || budget.couple_id !== currentUser.couple_id) {
    redirect("/budgets?error=budget_not_found");
  }

  const { error } = await admin.from("budgets").delete().eq("id", id);

  if (error) {
    redirect(`/budgets?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/budgets");
}
