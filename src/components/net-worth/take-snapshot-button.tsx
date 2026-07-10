"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CameraIcon } from "lucide-react";
import { captureSnapshotAction } from "@/app/net-worth/actions";

/**
 * Triggers an on-demand "today" snapshot of every account so the
 * net-worth-over-time chart gains a fresh point immediately.  Wrapped in a
 * client component because captureSnapshotAction returns a summary object
 * rather than redirecting, so it must be invoked imperatively (a plain form
 * action would try to render the returned object).
 */
export function TakeSnapshotButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setStatus(null);
    try {
      const res = await captureSnapshotAction();
      if (res.ok) {
        setStatus(`Captured ${res.captured} snapshot${res.captured === 1 ? "" : "s"}.`);
        router.refresh();
      } else {
        setStatus(res.error ?? "Couldn't capture snapshot.");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Couldn't capture snapshot.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={pending}
      >
        <CameraIcon className="mr-1.5 size-3.5" />
        {pending ? "Capturing…" : "Take snapshot"}
      </Button>
      {status && (
        <span className="text-[11px] text-muted-foreground">{status}</span>
      )}
    </div>
  );
}
