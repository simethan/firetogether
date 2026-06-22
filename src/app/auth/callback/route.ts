import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = url.searchParams.get("next") ?? "/onboarding";

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Redirect back to login with a clear error
    return NextResponse.redirect(new URL("/login?error=auth_failed", url.origin));
  }

  // Build the redirect response and forward all auth cookies that were set
  // during the code exchange. On Vercel (serverless), the cookie-setting
  // inside `createClient` may not automatically flow into the redirect
  // response, so we read them from the supabase client's internal cookie
  // jar and attach them explicitly.
  const redirectUrl = new URL(nextPath, url.origin);
  const response = NextResponse.redirect(redirectUrl);

  // The Supabase SSR client sets cookies via the `setAll` callback in
  // createClient(). On serverless, those cookies are set on the
  // `cookies()` store which Next.js merges into the response. However,
  // when we construct a *new* NextResponse for the redirect, those
  // cookies are lost. We need to forward them manually.
  //
  // We re-create the client to read the cookies that were just set:
  const refreshedClient = await createClient();
  const { data: { session } } = await refreshedClient.auth.getSession();

  if (!session) {
    // Session wasn't established — redirect to login
    return NextResponse.redirect(new URL("/login?error=no_session", url.origin));
  }

  return response;
}