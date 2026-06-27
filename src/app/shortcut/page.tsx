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

  const { data: categories } = await admin
    .from("categories")
    .select("id, name, icon")
    .eq("couple_id", currentUser.couple_id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  const categoryNames = (categories ?? []).map((category) => category.name);
  const exampleBody = `{
  "amount": 12.5,
  "expense_date": "2026-06-22",
  "description": "Coffee",
  "split_type": "shared",
  "category_name": "${categoryNames[0] ?? "Groceries"}",
  "custom_ratio": null
}`;
  const endpoint = `${getSiteUrl()}/api/shortcuts/add-expense`;
  const categoriesEndpoint = `${getSiteUrl()}/api/shortcuts/categories`;
  const summaryEndpoint = `${getSiteUrl()}/api/shortcuts/summary`;
  const authHeader = `Bearer ${shortcutToken}`;
  const widgetScript = `const endpoint = "${summaryEndpoint}";
const token = "${shortcutToken}";

const request = new Request(endpoint);
request.headers = { Authorization: "Bearer " + token };
const data = await request.loadJSON();

const widget = new ListWidget();
widget.backgroundColor = new Color("#15120f");
widget.setPadding(14, 14, 14, 14);

const title = widget.addText(data.month.label);
title.textColor = Color.gray();
title.font = Font.mediumSystemFont(11);

const spend = widget.addText(data.spend.mine_formatted);
spend.textColor = Color.white();
spend.font = Font.boldSystemFont(28);

const note = widget.addText("You spent • " + (data.budget.remaining_formatted ?? "no budget"));
note.textColor = new Color("#f97316");
note.font = Font.mediumSystemFont(12);

if (data.top_category) {
  const top = widget.addText("Top: " + data.top_category.name);
  top.textColor = Color.gray();
  top.font = Font.systemFont(11);
}

Script.setWidget(widget);
Script.complete();`;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 shadow-lg shadow-orange-500/5 sm:p-7 lg:p-8">
        <div className="absolute inset-y-6 left-0 w-1 rounded-r-full bg-linear-to-b from-primary via-chart-4 to-chart-2" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-4">
            <Badge
              variant="secondary"
              className="w-fit border-primary/20 bg-primary/10 text-primary"
            >
              iPhone tools
            </Badge>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Shortcuts + widgets
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Put FireTogether on your home screen
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Use Shortcuts for fast expense entry. Use the summary endpoint
              with Scriptable if you want a small iPhone widget with your spend,
              budget, and top category.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Link
              href="/expenses/new"
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-colors hover:bg-primary/90"
            >
              Add expense
            </Link>
            <Link
              href="/dashboard"
              className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              Quick add shortcut
            </CardTitle>
            <CardDescription>
              Build a shortcut that fetches your live categories, lets you
              choose one, then saves the expense.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border bg-muted/20 p-4 text-foreground">
              <p className="font-semibold">
                1. Fetch categories from FireTogether.
              </p>
              <p className="mt-1 text-muted-foreground">
                Add a Get Contents of URL action using the categories endpoint
                below. Set Method to GET and add the Authorization header.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4 text-foreground">
              <p className="font-semibold">
                2. Let Shortcuts show a category picker.
              </p>
              <p className="mt-1 text-muted-foreground">
                Get Dictionary Value for categories, repeat through each item,
                collect each item’s name, then use Choose from List.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4 text-foreground">
              <p className="font-semibold">
                3. Save the expense with category_name.
              </p>
              <p className="mt-1 text-muted-foreground">
                Send the chosen category name in your add-expense JSON.
                FireTogether resolves it to the right category ID.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">API values</CardTitle>
            <CardDescription>
              Copy these into Shortcuts, Scriptable, or another private
              automation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  Add expense endpoint
                </span>
                <CopyButton text={endpoint} label="Copy" copiedLabel="Copied" />
              </div>
              <div className="break-all rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
                {endpoint}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  Categories endpoint
                </span>
                <CopyButton
                  text={categoriesEndpoint}
                  label="Copy"
                  copiedLabel="Copied"
                />
              </div>
              <div className="break-all rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
                {categoriesEndpoint}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  Summary endpoint
                </span>
                <CopyButton
                  text={summaryEndpoint}
                  label="Copy"
                  copiedLabel="Copied"
                />
              </div>
              <div className="break-all rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
                {summaryEndpoint}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  Categorized example body
                </span>
                <CopyButton
                  text={exampleBody}
                  label="Copy"
                  copiedLabel="Copied"
                />
              </div>
              <pre className="overflow-auto rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
                {exampleBody}
              </pre>
            </div>

            <div className="space-y-2">
              <div>
                <span className="font-medium text-foreground">
                  Accepted category names
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the name exactly as shown. Icons are shown here for
                  scanning; Shortcuts should send the plain name.
                </p>
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

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">
                  Authorization header
                </span>
                <CopyButton
                  text={authHeader}
                  label="Copy"
                  copiedLabel="Copied"
                />
              </div>
              <div className="break-all rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
                {authHeader}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-primary/5 p-4 text-sm text-foreground">
              This token belongs to {currentUser.name}. Anyone with it can add
              expenses or read your widget summary, so do not share screenshots
              of this page.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-lg shadow-orange-500/5">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">
            Apple Shortcut setup guide
          </CardTitle>
          <CardDescription>
            Follow this exactly to save categorized expenses from your iPhone.
            Start with the simple version; use the live category picker after
            that works.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-foreground">
            <p className="font-semibold">Before you start</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              <li>Open Apple Shortcuts on your iPhone.</li>
              <li>Create a new shortcut named Add FireTogether expense.</li>
              <li>
                Copy the Add expense endpoint and Authorization header from this
                page.
              </li>
              <li>
                Use category names exactly as shown under Accepted category
                names.
              </li>
            </ul>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="font-semibold text-foreground">
                Simple version: fixed category list
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-4">
                <li>Add Ask for Input. Prompt: Amount. Type: Number.</li>
                <li>Add Ask for Input. Prompt: Description. Type: Text.</li>
                <li>
                  Add Current Date. If you want to choose dates manually, use
                  Ask for Input with Type: Date instead.
                </li>
                <li>
                  Add Choose from List. Tap List and add your category names,
                  one per line.
                </li>
                <li>
                  Add Choose from Menu for split type with options shared,
                  personal, custom. Start with shared if you want the easiest
                  setup.
                </li>
                <li>Add Dictionary. Add the JSON keys listed below.</li>
                <li>
                  Add Get Contents of URL. URL: Add expense endpoint. Method:
                  POST. Request Body: JSON. Body: the Dictionary.
                </li>
                <li>
                  In Get Contents of URL, add Header Authorization with the
                  Bearer token from this page.
                </li>
              </ol>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="font-semibold text-foreground">
                Dictionary keys for add expense
              </p>
              <div className="mt-2 overflow-auto rounded-xl border border-border bg-background/70 p-3 font-mono text-xs text-foreground">
                <div>amount → Amount answer</div>
                <div>expense_date → Current Date formatted as yyyy-MM-dd</div>
                <div>description → Description answer</div>
                <div>split_type → shared</div>
                <div>category_name → Chosen Item from category list</div>
                <div>
                  custom_ratio → leave blank/null unless split_type is custom
                </div>
              </div>
              <p className="mt-3 text-muted-foreground">
                Important: category_name should be the plain name, like
                Groceries, not the emoji label. FireTogether will turn that name
                into the right category ID.
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="font-semibold text-foreground">
                Live category picker: fetch categories first
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-4">
                <li>Add Get Contents of URL.</li>
                <li>URL: Categories endpoint.</li>
                <li>Method: GET.</li>
                <li>Add Header: Authorization = Bearer token.</li>
                <li>Add Get Dictionary from Input.</li>
                <li>Add Get Dictionary Value. Key: names.</li>
                <li>Add Choose from List. Input: Dictionary Value names.</li>
                <li>
                  Use Chosen Item as category_name in the expense Dictionary.
                </li>
              </ol>
              <p className="mt-3 text-muted-foreground">
                This is the easiest live version because the endpoint returns a
                names list specifically for Shortcuts.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="font-semibold text-foreground">
                If the shortcut fails
              </p>
              <ul className="mt-2 list-disc space-y-2 pl-4">
                <li>
                  401 Missing shortcut token: your Authorization header is
                  missing or does not start with Bearer.
                </li>
                <li>
                  Invalid shortcut token: copy the token again from this page.
                </li>
                <li>
                  Category was not found: the selected name does not match a
                  FireTogether category.
                </li>
                <li>
                  Request body must be valid JSON: make sure Get Contents of URL
                  uses Request Body: JSON.
                </li>
                <li>
                  Custom split ratio error: only send custom_ratio for custom
                  splits, and use a number between 0 and 1.
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="font-semibold text-foreground">
              Tiny checklist before testing
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-background/70 p-3">
                POST uses Add expense endpoint
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-3">
                GET uses Categories endpoint
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-3">
                Authorization header is set on both requests
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-3">
                category_name is the chosen category name
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              iPhone widget option
            </CardTitle>
            <CardDescription>
              Web apps cannot ship native iOS widgets by themselves, but
              Scriptable can display this endpoint on your home screen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="font-semibold text-foreground">
                1. Install Scriptable from the App Store.
              </p>
              <p className="mt-1">
                Create a new script and paste the widget script on the right.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="font-semibold text-foreground">
                2. Add a Scriptable widget to your home screen.
              </p>
              <p className="mt-1">Choose this script in the widget settings.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="font-semibold text-foreground">
                3. Keep the token private.
              </p>
              <p className="mt-1">
                The widget reads your monthly spend, budget remaining,
                personal spend, and top category.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold">
                  Scriptable widget script
                </CardTitle>
                <CardDescription>
                  Paste this into a private Scriptable script.
                </CardDescription>
              </div>
              <CopyButton
                text={widgetScript}
                label="Copy script"
                copiedLabel="Copied"
              />
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-112 overflow-auto rounded-2xl border border-border bg-muted/30 p-4 font-mono text-xs leading-5 text-foreground">
              {widgetScript}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
