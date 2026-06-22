"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

  return { currentUser, admin } as const;
}

export async function createCategoryAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const name = parseString(formData.get("name"));
  const icon = parseString(formData.get("icon"));

  if (!name) {
    redirect("/categories?error=Enter%20a%20category%20name.");
  }

  const { error } = await admin.from("categories").insert({
    couple_id: currentUser.couple_id,
    name,
    icon,
    is_default: false,
  });

  if (error) {
    redirect(`/categories?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/categories");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/categories");
}

export async function updateCategoryAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));
  const name = parseString(formData.get("name"));
  const icon = parseString(formData.get("icon"));

  if (!id || !name) {
    redirect("/categories?error=Invalid%20category%20update.");
  }

  const { data: category } = await admin
    .from("categories")
    .select("id, couple_id")
    .eq("id", id)
    .maybeSingle();

  if (!category || category.couple_id !== currentUser.couple_id) {
    redirect("/categories?error=category_not_found");
  }

  const { error } = await admin
    .from("categories")
    .update({ name, icon })
    .eq("id", id);

  if (error) {
    redirect(`/categories?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/categories");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/categories");
}

export async function deleteCategoryAction(formData: FormData) {
  const { currentUser, admin } = await getCurrentUserOrRedirect();
  const id = parseString(formData.get("id"));

  if (!id) {
    redirect("/categories?error=Invalid%20category%20delete.");
  }

  const { data: category } = await admin
    .from("categories")
    .select("id, couple_id")
    .eq("id", id)
    .maybeSingle();

  if (!category || category.couple_id !== currentUser.couple_id) {
    redirect("/categories?error=category_not_found");
  }

  const { count } = await admin
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if ((count ?? 0) > 0) {
    redirect("/categories?error=Category%20is%20used%20by%20expenses%20and%20cannot%20be%20deleted.");
  }

  const { error } = await admin.from("categories").delete().eq("id", id);

  if (error) {
    redirect(`/categories?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/categories");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect("/categories");
}
