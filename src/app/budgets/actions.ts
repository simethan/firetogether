"use server";

import { formatCurrency, getMonthStartDate, getNextMonthEnd } from "@/lib/finance";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getCurrentUserOrRedirect,
  parseAmount,
  parseString,
} from "@/lib/actions";

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

export async function createBudgetAction(formData: FormData): Promise<void> {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const amount = parseAmount(formData.get("amount"));
  const month = parseMonth(formData.get("month"));
  const categoryId = parseString(formData.get("category_id"));
  const isShared = formData.get("is_shared") === "true";

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
        is_shared: isShared,
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
        .update({ amount, is_shared: isShared })
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
        is_shared: isShared,
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

/** Fund an envelope — add to funded_amount from Ready to Assign. */
export async function fundEnvelopeAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));
  const amount = parseAmount(formData.get("amount"));

  if (!id || !amount || amount <= 0) {
    redirect("/budgets?error=Enter%20a%20valid%20amount.");
  }

  const { data: budget } = await admin
    .from("budgets")
    .select("id, couple_id, funded_amount, month")
    .eq("id", id)
    .maybeSingle();

  if (!budget || budget.couple_id !== currentUser.couple_id) {
    redirect("/budgets?error=Budget%20not%20found.");
  }

  // Check that we're not exceeding Ready to Assign
  const budgetMonth = (budget.month ?? getMonthStartDate(new Date().toISOString().slice(0, 7))).slice(0, 7);
  const monthStart = getMonthStartDate(budgetMonth);
  const monthEnd = getNextMonthEnd(budgetMonth);

  const [{ data: income }, { data: allBudgets }] = await Promise.all([
    admin
      .from("income")
      .select("amount")
      .eq("couple_id", currentUser.couple_id)
      .gte("income_date", monthStart)
      .lt("income_date", monthEnd),
    admin
      .from("budgets")
      .select("funded_amount")
      .eq("couple_id", currentUser.couple_id)
      .eq("month", monthStart),
  ]);

  const totalIncome = (income ?? []).reduce((s, i) => s + Number(i.amount), 0);
  const totalFundedBefore = (allBudgets ?? []).reduce((s, b) => s + (Number(b.funded_amount) || 0), 0);
  const readyToAssign = totalIncome - totalFundedBefore;

  if (amount > readyToAssign) {
    redirect(`/budgets?error=${encodeURIComponent(`Not enough funds to assign. You only have $${readyToAssign.toFixed(2)} ready.`)}`);
  }

  const currentFunded = Number(budget.funded_amount) || 0;
  const { error } = await admin
    .from("budgets")
    .update({ funded_amount: currentFunded + amount })
    .eq("id", id);

  if (error) {
    redirect(`/budgets?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/budgets");
}

/** Move money from one envelope to another. */
export async function moveMoneyAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const fromId = parseString(formData.get("from_id"));
  const toId = parseString(formData.get("to_id"));
  const amount = parseAmount(formData.get("amount"));

  if (!fromId || !toId || !amount || amount <= 0) {
    redirect("/budgets?error=Invalid%20move%20request.");
  }

  if (fromId === toId) {
    redirect("/budgets?error=Cannot%20move%20money%20to%20the%20same%20envelope.");
  }

  const { data: budgets } = await admin
    .from("budgets")
    .select("id, couple_id, funded_amount")
    .in("id", [fromId, toId]);

  if (!budgets || budgets.length !== 2) {
    redirect("/budgets?error=One%20or%20both%20budgets%20not%20found.");
  }

  const fromBudget = budgets.find((b) => b.id === fromId);
  const toBudget = budgets.find((b) => b.id === toId);

  if (!fromBudget || !toBudget) {
    redirect("/budgets?error=Budget%20not%20found.");
  }

  if (
    fromBudget.couple_id !== currentUser.couple_id ||
    toBudget.couple_id !== currentUser.couple_id
  ) {
    redirect("/budgets?error=Budget%20not%20found.");
  }

  const fromFunded = Number(fromBudget.funded_amount) || 0;
  if (fromFunded < amount) {
    redirect("/budgets?error=Not%20enough%20funds%20in%20source%20envelope.");
  }

  const toFunded = Number(toBudget.funded_amount) || 0;

  const { error: e1 } = await admin
    .from("budgets")
    .update({ funded_amount: fromFunded - amount })
    .eq("id", fromId);

  if (e1) {
    redirect(`/budgets?error=${encodeURIComponent(e1.message)}`);
  }

  const { error: e2 } = await admin
    .from("budgets")
    .update({ funded_amount: toFunded + amount })
    .eq("id", toId);

  if (e2) {
    // Rollback
    await admin
      .from("budgets")
      .update({ funded_amount: fromFunded })
      .eq("id", fromId);
    redirect(`/budgets?error=${encodeURIComponent(e2.message)}`);
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/budgets");
}

/** Cover overspending in one envelope from another envelope. */
export async function coverOverspendingAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const overdrawnId = parseString(formData.get("overdrawn_id"));
  const fromId = parseString(formData.get("from_id"));
  const amount = parseAmount(formData.get("amount"));

  if (!overdrawnId || !fromId || !amount || amount <= 0) {
    redirect("/budgets?error=Invalid%20cover%20request.");
  }

  const { data: budgets } = await admin
    .from("budgets")
    .select("id, couple_id, funded_amount")
    .in("id", [overdrawnId, fromId]);

  if (!budgets || budgets.length !== 2) {
    redirect("/budgets?error=One%20or%20both%20budgets%20not%20found.");
  }

  const overdrawnBudget = budgets.find((b) => b.id === overdrawnId);
  const fromBudget = budgets.find((b) => b.id === fromId);

  if (!overdrawnBudget || !fromBudget) {
    redirect("/budgets?error=Budget%20not%20found.");
  }

  if (
    overdrawnBudget.couple_id !== currentUser.couple_id ||
    fromBudget.couple_id !== currentUser.couple_id
  ) {
    redirect("/budgets?error=Budget%20not%20found.");
  }

  const fromFunded = Number(fromBudget.funded_amount) || 0;
  if (fromFunded < amount) {
    redirect("/budgets?error=Not%20enough%20funds%20in%20source%20envelope.");
  }

  const overdrawnFunded = Number(overdrawnBudget.funded_amount) || 0;

  const { error: e1 } = await admin
    .from("budgets")
    .update({ funded_amount: fromFunded - amount })
    .eq("id", fromId);

  if (e1) {
    redirect(`/budgets?error=${encodeURIComponent(e1.message)}`);
  }

  const { error: e2 } = await admin
    .from("budgets")
    .update({ funded_amount: overdrawnFunded + amount })
    .eq("id", overdrawnId);

  if (e2) {
    // Rollback
    await admin
      .from("budgets")
      .update({ funded_amount: fromFunded })
      .eq("id", fromId);
    redirect(`/budgets?error=${encodeURIComponent(e2.message)}`);
  }

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/budgets");
}
