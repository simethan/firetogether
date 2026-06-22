import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/shortcut/copy-button";
import { createServiceClient } from "@/lib/supabase/admin";
import { generateShortcutToken, getAuthUserId } from "@/lib/auth";
import { getSiteUrl } from "@/lib/siteUrl";

export default async function ShortcutPage() {
  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id, email, name, shortcut_token")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) {
    redirect("/onboarding");
  }

  let shortcutToken = currentUser.shortcut_token;

  if (!shortcutToken) {
    shortcutToken = generateShortcutToken();

    const { error } = await admin
      .from("users")
      .update({ shortcut_token: shortcutToken })
      .eq("id", currentUser.id);

    if (error) {
      throw error;
    }
  }

  const endpoint = `${getSiteUrl()}/api/shortcuts/add-expense`;
  const authHeader = `Bearer ${shortcutToken}`;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 p-8 shadow-lg shadow-orange-500/5">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="gap-1.5 border-primary/20 bg-primary/10 text-primary">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              iPhone shortcut
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Quick add expenses from your <span className="text-primary">iPhone</span>
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Create the shortcut once, paste in your personal token, and send expenses to FireTogether in seconds.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/expenses/new"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.97]"
            >
              + Add expense
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">📱 Shortcut steps</CardTitle>
            <CardDescription>Build a simple POST request in the Shortcuts app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border bg-gradient-to-br from-muted/40 to-muted/10 p-4 text-foreground transition-colors hover:border-primary/20">
              <p className="font-semibold">1. Create a new shortcut in Apple Shortcuts.</p>
              <p className="mt-1 text-muted-foreground">Add prompts for amount, description, date, split type, and optional category.</p>
            </div>
            <div className="rounded-2xl border border-border bg-gradient-to-br from-muted/40 to-muted/10 p-4 text-foreground transition-colors hover:border-primary/20">
              <p className="font-semibold">2. Add a "Get Contents of URL" action.</p>
              <p className="mt-1 text-muted-foreground">Use a POST request to the endpoint on the right.</p>
            </div>
            <div className="rounded-2xl border border-border bg-gradient-to-br from-muted/40 to-muted/10 p-4 text-foreground transition-colors hover:border-primary/20">
              <p className="font-semibold">3. Set the header to your token.</p>
              <p className="mt-1 text-muted-foreground">Use Authorization: Bearer and paste your personal shortcut token.</p>
            </div>
            <div className="rounded-2xl border border-border bg-gradient-to-br from-muted/40 to-muted/10 p-4 text-foreground transition-colors hover:border-primary/20">
              <p className="font-semibold">4. Send JSON with the expense fields.</p>
              <p className="mt-1 text-muted-foreground">The API accepts amount, date, split type, description, category, and custom ratio.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">🔑 Your setup values</CardTitle>
            <CardDescription>Copy these into the shortcut once and reuse it forever.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">API endpoint</span>
                <CopyButton text={endpoint} label="Copy endpoint" copiedLabel="Copied" />
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground break-all">
                {endpoint}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">Authorization header</span>
                <CopyButton text={authHeader} label="Copy header" copiedLabel="Copied" />
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground break-all">
                {authHeader}
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">Example body</p>
              <pre className="overflow-x-auto rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
{`{
  "amount": 12.5,
  "expense_date": "2026-06-22",
  "description": "Coffee",
  "split_type": "shared",
  "category_id": null,
  "custom_ratio": null
}`}
              </pre>
            </div>

            <div className="rounded-xl border border-border bg-primary/5 p-4 text-sm text-foreground">
              Your shortcut token is tied to {currentUser.name}. If you ever want to rotate it, open this page again and it will be regenerated.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}