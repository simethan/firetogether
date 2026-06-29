import crypto from "node:crypto";

import { createServiceClient } from "@/lib/supabase/admin";
import type { Couple, User } from "@/lib/types";

export async function getAuthUserId() {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  return data.user?.id ?? null;
}

export async function getCurrentCouple(coupleId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("couples")
    .select("id, invite_code, created_at")
    .eq("id", coupleId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as Couple | null;
}

export function generateInviteCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export function generateShortcutToken() {
  return crypto.randomBytes(16).toString("hex");
}