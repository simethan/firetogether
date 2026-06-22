import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/siteUrl";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = url.searchParams.get("next") ?? "/onboarding";

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // We must build the Supabase client manually here so we can capture
  // the cookies that exchangeCodeForSession wants to set and attach
  // them to our redirect response. Using the shared createClient()
  // from server.ts sets cookies on the cookies() store, but those
  // cookies are lost when we construct a new NextResponse for the
  // redirect — which is why auth worked locally (same process) but
  // broke on Vercel (serverless, separate invocations).
  const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        // On the first call there are no auth cookies yet
        return [];
      },
      setAll(cookies) {
        for (const c of cookies) {
          cookiesToSet.push({ name: c.name, value: c.value, options: c.options });
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", url.origin));
  }

  // Build the redirect and attach every auth cookie the SSR client
  // wants to set. This is the critical step that was missing —
  // without it the session cookies never reach the browser on Vercel.
  const redirectUrl = new URL(nextPath, url.origin);
  const response = NextResponse.redirect(redirectUrl);

  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, {
      ...options,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}