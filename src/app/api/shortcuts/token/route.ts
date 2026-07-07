import crypto from "node:crypto";

import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {
  const authUserId = await getAuthUserId();
  if (!authUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceClient();
  const { data: user } = await admin
    .from("users")
    .select("id")
    .eq("id", authUserId)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let token: string | undefined;

  try {
    const body = await request.json();
    token = body?.token?.trim();
  } catch {
    // No body or invalid JSON — generate a new random token
  }

  // Always strong by default: generate a 64-char hex token (256 bits).
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
  }

  // Custom tokens are allowed but must be high-entropy (>= 32 chars).
  if (token.length < 32) {
    return NextResponse.json(
      { error: "Token must be at least 32 characters" },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("users")
    .update({ shortcut_token: token })
    .eq("id", authUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token });
}
