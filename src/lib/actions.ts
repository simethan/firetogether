import { redirect } from "next/navigation";

import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";

export type ActionUser = { id: string; couple_id: string };

/**
 * Resolve the authenticated user and a service client, redirecting to
 * /login or /onboarding when appropriate.  Centralized so every server
 * action enforces the same couple scoping (no action can forget it).
 */
export async function getCurrentUserOrRedirect() {
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

  return { authUserId, currentUser: currentUser as ActionUser, admin } as const;
}

export function parseAmount(value: FormDataEntryValue | null): number | null {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseString(
  value: FormDataEntryValue | null,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseDate(value: FormDataEntryValue | null): string | null {
  const parsed = parseString(value);
  if (!parsed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : null;
}
