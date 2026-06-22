"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");

    if (!code) {
      router.replace("/login?error=no_code");
      return;
    }

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) {
          console.error("Code exchange failed:", exchangeError.message);
          setError(exchangeError.message);
          return;
        }

        // Session cookies are now set in the browser.
        // Redirect to onboarding — the DB trigger already
        // created the public.users row, so onboarding just
        // needs to collect the name and couple info.
        router.replace("/onboarding");
      })
      .catch((err) => {
        console.error("Unexpected error:", err);
        setError("An unexpected error occurred.");
      });
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-12">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-4">😕</div>
          <h1 className="text-xl font-semibold mb-2">Authentication failed</h1>
          <p className="text-muted-foreground mb-4">{error}</p>
          <a
            href="/login"
            className="text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="text-center">
        <div className="animate-spin text-3xl mb-4">🔥</div>
        <h1 className="text-xl font-semibold">Signing you in…</h1>
        <p className="text-muted-foreground mt-1">Just a moment.</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center px-4 py-12">
          <div className="text-center">
            <div className="animate-spin text-3xl mb-4">🔥</div>
            <h1 className="text-xl font-semibold">Signing you in…</h1>
            <p className="text-muted-foreground mt-1">Just a moment.</p>
          </div>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
