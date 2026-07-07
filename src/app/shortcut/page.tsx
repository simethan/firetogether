import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategoryIcon } from "@/components/categories/category-icon";
import { CopyButton } from "@/components/shortcut/copy-button";
import { TokenManager } from "@/components/shortcut/token-manager";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
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

  const { data: categories } = await admin
    .from("categories")
    .select("id, name, icon")
    .eq("couple_id", currentUser.couple_id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  const categoryNames = (categories ?? []).map((category) => category.name);
  const endpoint = `${getSiteUrl()}/api/shortcuts/add-expense`;
  const categoriesEndpoint = `${getSiteUrl()}/api/shortcuts/categories`;
  const summaryEndpoint = `${getSiteUrl()}/api/shortcuts/summary`;
  const authHeader = shortcutToken ? `Bearer ${shortcutToken}` : "";
  const shortcutUrl =
    "https://www.icloud.com/shortcuts/9dd9a791bd254b75badd37ef1d4e3d29";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Hero — download the shortcut */}
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 sm:p-7 lg:p-8">
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-4">
            <Badge
              variant="secondary"
              className="w-fit border-primary/20 bg-primary/10 text-primary"
            >
              iPhone shortcut
            </Badge>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Add expenses from your iPhone
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                One tap, no app open
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Download the shortcut, paste your Bearer token inside, and add
              expenses straight to FireTogether from anywhere on your phone.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href={shortcutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
              >
                <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
                <path d="M12 3v12" />
                <path d="m9 12 3 3 3-3" />
              </svg>
              Get the shortcut
            </a>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Token card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              Your auth token
            </CardTitle>
            <CardDescription>
              The shortcut needs this Bearer token to talk to FireTogether.
              Paste it into the &ldquo;Token&rdquo; text action inside the
              shortcut.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TokenManager
              currentToken={shortcutToken}
              authHeader={authHeader}
            />
          </CardContent>
        </Card>

        {/* Quick reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              Quick reference
            </CardTitle>
            <CardDescription>
              Endpoints and category names the shortcut uses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  Add expense
                </span>
                <CopyButton text={endpoint} label="Copy" copiedLabel="Copied" />
              </div>
              <div className="break-all rounded-xl border border-border bg-muted/30 p-3 font-mono text-[11px] text-foreground">
                {endpoint}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  Categories list
                </span>
                <CopyButton
                  text={categoriesEndpoint}
                  label="Copy"
                  copiedLabel="Copied"
                />
              </div>
              <div className="break-all rounded-xl border border-border bg-muted/30 p-3 font-mono text-[11px] text-foreground">
                {categoriesEndpoint}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  Monthly summary
                </span>
                <CopyButton
                  text={summaryEndpoint}
                  label="Copy"
                  copiedLabel="Copied"
                />
              </div>
              <div className="break-all rounded-xl border border-border bg-muted/30 p-3 font-mono text-[11px] text-foreground">
                {summaryEndpoint}
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <span className="font-medium text-foreground">
                  Category names
                </span>
              </div>
              {categoryNames.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(categories ?? []).map((category) => (
                    <span
                      key={category.id}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-foreground"
                    >
                      <CategoryIcon
                        icon={category.icon}
                        className="h-3.5 w-3.5 text-primary"
                      />
                      <span>{category.name}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  No categories yet. Create categories first, then use those
                  names in the shortcut.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
