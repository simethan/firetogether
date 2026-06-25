import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = url.searchParams.get("next") ?? "/onboarding";

  // OAuth providers may return error params if the user denies consent
  // or something went wrong at the provider level.
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  if (oauthError) {
    const message = oauthErrorDescription || oauthError;
    console.error("OAuth provider error:", oauthError, oauthErrorDescription);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Parse cookies from the incoming request so the SSR client can
  // read the PKCE code verifier that was stored by the browser-side
  // signInWithOAuth call. Without this, exchangeCodeForSession fails
  // with "PKCE code verifier not found in storage".
  const requestCookies: Array<{ name: string; value: string }> = [];
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [rawName, ...rest] = part.split("=");
      const name = rawName?.trim();
      const value = rest.join("=").trim();
      if (name) requestCookies.push({ name, value });
    }
  }

  const cookiesToSet: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return requestCookies;
      },
      setAll(cookies) {
        for (const c of cookies) {
          cookiesToSet.push({
            name: c.name,
            value: c.value,
            options: c.options,
          });
        }
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
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
