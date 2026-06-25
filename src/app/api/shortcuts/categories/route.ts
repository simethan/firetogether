import { NextRequest, NextResponse } from "next/server";

import { getShortcutCategoryLabel } from "@/components/categories/category-icon";
import { createServiceClient } from "@/lib/supabase/admin";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const receivedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!receivedToken) {
    return unauthorized("Missing shortcut token.");
  }

  const admin = createServiceClient();
  const { data: user, error: userError } = await admin
    .from("users")
    .select("id, couple_id, shortcut_token")
    .eq("shortcut_token", receivedToken)
    .maybeSingle();

  if (userError) {
    return badRequest(userError.message);
  }

  if (!user?.couple_id) {
    return unauthorized("Invalid shortcut token.");
  }

  const { data: categories, error: categoriesError } = await admin
    .from("categories")
    .select("id, name, icon, is_default")
    .eq("couple_id", user.couple_id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (categoriesError) {
    return badRequest(categoriesError.message);
  }

  const items = (categories ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon,
    icon_name: category.icon,
    label: category.name,
    shortcut_label: getShortcutCategoryLabel(category.name, category.icon),
    is_default: category.is_default,
  }));

  return NextResponse.json({
    ok: true,
    categories: items,
    names: items.map((category) => category.name),
    labels: items.map((category) => category.name),
    shortcut_labels: items.map((category) => category.shortcut_label),
  });
}
