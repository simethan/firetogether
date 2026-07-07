"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/shortcut/copy-button";

type Props = {
  currentToken: string | null;
  authHeader: string;
};

export function TokenManager({ currentToken, authHeader }: Props) {
  const router = useRouter();
  const [customToken, setCustomToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSetToken() {
    const token = customToken.trim();
    if (!token || token.length < 32) {
      setMessage({ type: "error", text: "Token must be at least 32 characters." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/shortcuts/token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save token");
      }
      setMessage({ type: "success", text: "Token saved!" });
      setCustomToken("");
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/shortcuts/token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to regenerate token");
      }
      setMessage({ type: "success", text: "New token generated!" });
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-foreground">
            Your Bearer token
          </span>
          {currentToken ? (
            <CopyButton text={currentToken} label="Copy" copiedLabel="Copied!" />
          ) : null}
        </div>
        <div className="break-all rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
          {currentToken || "No token yet — generate one below."}
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          This token belongs to your account. Anyone with it can add expenses or read your data — keep it private, don't share screenshots of this page.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={saving}
        >
          {saving ? "Working…" : currentToken ? "Generate new" : "Create token"}
        </Button>
      </div>

      <div className="space-y-2 border-t border-border/70 pt-4">
        <label className="text-sm font-medium text-foreground">
          Or set your own token
        </label>
        <div className="flex gap-2">
          <Input
            value={customToken}
            onChange={(e) => {
              setCustomToken(e.target.value);
              setMessage(null);
            }}
             placeholder="Enter a custom token (min 32 characters)"
            className="font-mono text-sm"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSetToken}
            disabled={saving || customToken.trim().length < 32}
          >
            Save
          </Button>
        </div>
        {message && (
          <p
            className={`text-xs ${
              message.type === "success"
                ? "text-emerald-500"
                : "text-destructive"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
