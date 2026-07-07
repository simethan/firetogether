import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { formatCurrency } from "@/lib/finance";
import type { Category, ScheduledTransaction } from "@/lib/types";
import {
  createScheduledAction,
  deleteScheduledAction,
  postScheduledAction,
  toggleScheduledAction,
} from "./actions";

function ErrorBanner({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {decodeURIComponent(error)}
    </div>
  );
}

function formatFrequency(frequency: string, interval: number) {
  if (interval <= 1) {
    return frequency === "monthly" ? "Monthly" : frequency === "weekly" ? "Weekly" : "Yearly";
  }
  return `Every ${interval} ${frequency.replace("ly", "")}s`;
}

export default async function ScheduledPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const error =
    typeof resolved.error === "string" ? resolved.error : undefined;

  const authUserId = await getAuthUserId();
  if (!authUserId) redirect("/login");

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) redirect("/onboarding");

  const [{ data: categories }, { data: scheduled }] = await Promise.all([
    admin
      .from("categories")
      .select("id, couple_id, name, icon, is_default, created_at")
      .eq("couple_id", currentUser.couple_id)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true }),
    admin
      .from("scheduled_transactions")
      .select(
        "id, couple_id, user_id, category_id, payee_id, amount, description, split_type, custom_ratio, frequency, frequency_interval, next_date, end_date, is_active, created_at",
      )
      .eq("couple_id", currentUser.couple_id)
      .order("next_date", { ascending: true }),
  ]);

  const typedCategories = (categories ?? []) as Category[];
  const typedScheduled = (scheduled ?? []) as ScheduledTransaction[];
  const categoryById = new Map(typedCategories.map((c) => [c.id, c]));

  const today = new Date();
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(today.getDate() + 3);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 sm:p-7 lg:p-8">
        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-4">
            <Badge
              variant="secondary"
              className="w-fit border-primary/20 bg-primary/10 text-primary"
            >
              Scheduled
            </Badge>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Upcoming
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Scheduled transactions
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Recurring expenses and bills. See what&apos;s coming so you can
              fund envelopes ahead of time.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Active</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {typedScheduled.filter((s) => s.is_active).length}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Total / month</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatCurrency(
                  typedScheduled
                    .filter((s) => s.is_active)
                    .reduce((sum, s) => {
                      const monthly =
                        s.frequency === "weekly"
                          ? Number(s.amount) * 4.33
                          : s.frequency === "yearly"
                            ? Number(s.amount) / 12
                            : Number(s.amount) / (s.frequency_interval || 1);
                      return sum + monthly;
                    }, 0),
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ErrorBanner error={error} />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr]">
        {/* Add form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              Add scheduled transaction
            </CardTitle>
            <CardDescription>
              Set up a recurring expense or bill.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createScheduledAction} className="grid gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  name="description"
                  placeholder="Rent, Netflix, etc."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="1200.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category_id">Category</Label>
                  <select
                    id="category_id"
                    name="category_id"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    defaultValue=""
                  >
                    <option value="">No category</option>
                    {typedCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequency</Label>
                  <select
                    id="frequency"
                    name="frequency"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    defaultValue="monthly"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frequency_interval">Every</Label>
                  <Input
                    id="frequency_interval"
                    name="frequency_interval"
                    type="number"
                    min="1"
                    defaultValue={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next_date">Next date</Label>
                  <Input
                    id="next_date"
                    name="next_date"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="split_type">Split type</Label>
                  <select
                    id="split_type"
                    name="split_type"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    defaultValue="shared"
                  >
                    <option value="shared">Shared</option>
                    <option value="personal">Personal</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End date (optional)</Label>
                  <Input id="end_date" name="end_date" type="date" />
                </div>
              </div>

              <Button type="submit" className="w-full sm:w-fit">
                Add scheduled
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              All scheduled transactions
            </CardTitle>
            <CardDescription>
              Upcoming recurring expenses and bills.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {typedScheduled.length > 0 ? (
              <div className="space-y-2">
                {typedScheduled.map((entry) => {
                  const category = entry.category_id
                    ? categoryById.get(entry.category_id)
                    : null;
                  const nextDate = new Date(`${entry.next_date}T00:00:00`);
                  const isDueSoon =
                    entry.is_active && nextDate <= threeDaysFromNow;
                    const isPast = entry.is_active && nextDate < today;

                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${
                        entry.is_active
                          ? "border-border bg-muted/20"
                          : "border-border/50 bg-muted/10 opacity-60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <span className="truncate">
                            {entry.description ?? "Scheduled transaction"}
                          </span>
                          {isDueSoon && !isPast ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-amber-600 border-amber-300">
                              Due soon
                            </Badge>
                          ) : null}
                          {!entry.is_active ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              Paused
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {category ? (
                            <>
                              <span>{category.name}</span>
                              <span className="opacity-40">·</span>
                            </>
                          ) : null}
                          <span>{formatFrequency(entry.frequency, entry.frequency_interval)}</span>
                          <span className="opacity-40">·</span>
                          <span>
                            Next:{" "}
                            {new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                            }).format(nextDate)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatCurrency(Number(entry.amount))}
                        </span>
                        <form action={postScheduledAction}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button
                            type="submit"
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            Post
                          </button>
                        </form>
                        <form action={toggleScheduledAction}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button
                            type="submit"
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            {entry.is_active ? "Pause" : "Resume"}
                          </button>
                        </form>
                        <form action={deleteScheduledAction}>
                          <input type="hidden" name="id" value={entry.id} />
                          <button
                            type="submit"
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 py-10 text-center">
                <span className="text-4xl">📅</span>
                <p className="text-sm text-muted-foreground">
                  No scheduled transactions yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
