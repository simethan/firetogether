import { createServiceClient } from "@/lib/supabase/admin";
import type { ShortcutExpensePayload } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function parseAmount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function parseString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function parseSplitType(value: unknown) {
  if (value === "personal" || value === "shared" || value === "custom") {
    return value;
  }

  return null;
}

function parsePayload(body: unknown): { payload: ShortcutExpensePayload; errors: string[] } | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const candidate = body as Record<string, unknown>;
  const errors: string[] = [];

  const amount = parseAmount(candidate.amount);
  if (amount === null) {
    errors.push("amount must be a positive number");
  }

  const expenseDate = parseString(candidate.expense_date);
  if (expenseDate === null) {
    errors.push("expense_date must be a non-empty string");
  }

  const splitType = parseSplitType(candidate.split_type);
  if (splitType === null) {
    errors.push('split_type must be "personal", "shared", or "custom"');
  }

  if (errors.length > 0) {
    return { payload: null as unknown as ShortcutExpensePayload, errors };
  }

  const description = typeof candidate.description === "string" ? candidate.description.trim() : undefined;
  const categoryId = candidate.category_id == null ? null : parseString(candidate.category_id);
  const customRatio =
    candidate.custom_ratio == null
      ? null
      : typeof candidate.custom_ratio === "number" && Number.isFinite(candidate.custom_ratio)
        ? candidate.custom_ratio
        : null;

  return {
    payload: {
      amount: amount!,
      expense_date: expenseDate!,
      split_type: splitType!,
      category_id: categoryId,
      description,
      custom_ratio: customRatio,
    },
    errors: [],
  };
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const receivedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!receivedToken) {
    return unauthorized("Missing shortcut token.");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = parsePayload(body);

  if (!parsed || parsed.errors.length > 0) {
    const details = parsed ? parsed.errors.join("; ") : "Request body must be a JSON object.";
    return badRequest(`Missing or invalid expense fields: ${details}`);
  }

  const payload = parsed.payload;

  if (payload.split_type === "custom") {
    if (typeof payload.custom_ratio !== "number" || payload.custom_ratio <= 0 || payload.custom_ratio > 1) {
      return badRequest("Custom split ratio must be between 0 and 1.");
    }
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

  if (!user) {
    return unauthorized("Invalid shortcut token.");
  }

  if (payload.category_id) {
    const { data: category, error: categoryError } = await admin
      .from("categories")
      .select("id, couple_id")
      .eq("id", payload.category_id)
      .maybeSingle();

    if (categoryError) {
      return badRequest(categoryError.message);
    }

    if (!category || category.couple_id !== user.couple_id) {
      return forbidden("Category does not belong to the current couple.");
    }
  }

  const { data: expense, error: insertError } = await admin
    .from("expenses")
    .insert({
      couple_id: user.couple_id,
      user_id: user.id,
      category_id: payload.category_id ?? null,
      amount: payload.amount,
      description: payload.description ?? null,
      expense_date: payload.expense_date,
      split_type: payload.split_type,
      custom_ratio: payload.split_type === "custom" ? payload.custom_ratio : null,
    })
    .select("id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at")
    .single();

  if (insertError) {
    return badRequest(insertError.message);
  }

  return NextResponse.json(
    {
      ok: true,
      expense,
    },
    { status: 201 }
  );
}