"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { autoBackfillAction } from "@/app/net-worth/actions";

/**
 * Fires the automatic stock-history backfill after the page mounts.  Using a
 * server action (rather than a side effect during the server-component
 * render) guarantees the writes actually persist, and any failure is shown to
 * the user instead of being swallowed.  It retries a few times while history
 * is still incomplete, so a transiently truncated Yahoo response self-heals.
 */
const MAX_ATTEMPTS = 4;

export function AutoBackfill() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (cancelled || attempts.current >= MAX_ATTEMPTS) return;
      attempts.current += 1;

      try {
        const res = await autoBackfillAction();
        if (cancelled) return;

        if (!res.ok) {
          setError(res.error ?? "Unknown backfill error.");
          return;
        }

        if (res.backfilled > 0) {
          router.refresh();
          // History may still be incomplete (e.g. a truncated Yahoo response);
          // give the refresh a moment, then verify/retry.
          setTimeout(run, 800);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!error) return null;

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      Couldn&rsquo;t auto-backfill stock history: {error}
    </div>
  );
}
