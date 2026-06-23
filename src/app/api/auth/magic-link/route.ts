import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/siteUrl";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const result = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    });

    const error = result.error;

    if (error) {
      // Supabase AuthError properties may not be enumerable,
      // so extract them explicitly.
      let message =
        error.message ||
        error.name ||
        (typeof error === "object" ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : String(error));

      // The database trigger error surfaces as a cryptic "{}" message.
      // Give the user something actionable.
      if (message === "{}" || message === "") {
        message = "Authentication service error — this usually means a database trigger is blocking user creation. Please contact support.";
      }

      console.error("signInWithOtp error:", message, error);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    // Catch any unexpected throw (e.g. from createClient or request.json())
    const message = err instanceof Error ? err.message : String(err);
    console.error("magic-link route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
