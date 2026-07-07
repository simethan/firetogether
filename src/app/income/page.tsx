import { redirect } from "next/navigation";
import Link from "next/link";

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
import { getRequestTimeZone } from "@/lib/timezone";
import {
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthValue,
  getMonthStartDate,
  getNextMonthEnd,
} from "@/lib/finance";
import type { Income, User } from "@/lib/types";
import { createIncomeAction, deleteIncomeAction } from "./actions";

function ErrorBanner({ searchParams }: { searchParams: { error?: string } }) {
  if (!searchParams.error) return null;
  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {decodeURIComponent(searchParams.error)}
    </div>
  );
}

export default async function IncomePage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const authUserId = await getAuthUserId();

  if (!authUserId) redirect("/login");

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) redirect("/onboarding");

  const tz = await getRequestTimeZone();
  const currentMonth = getCurrentMonthValue(tz);
  const monthStart = getMonthStartDate(currentMonth);
  const monthEnd = getNextMonthEnd(currentMonth);
  const monthLabel = formatMonthLabel(currentMonth);

  const [{ data: members }, { data: income }] = await Promise.all([
    admin
      .from("users")
      .select("id, couple_id, name, created_at")
      .eq("couple_id", currentUser.couple_id)
      .order("created_at", { ascending: true }),
    admin
      .from("income")
      .select("id, couple_id, user_id, amount, source, income_date, created_at")
      .eq("couple_id", currentUser.couple_id)
      .gte("income_date", monthStart)
      .lt("income_date", monthEnd)
      .order("income_date", { ascending: false }),
  ]);

  const typedMembers = (members ?? []) as User[];
  const typedIncome = (income ?? []) as Income[];
  const userById = new Map(typedMembers.map((m) => [m.id, m]));

  const totalIncome = typedIncome.reduce((sum, i) => sum + Number(i.amount), 0);

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
              Income
            </Badge>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
                {monthLabel}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Money in
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Record income to fund your envelopes. Every dollar that comes in
              gets assigned a job.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">This month</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatCurrency(totalIncome)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 p-4">
              <div className="text-sm text-muted-foreground">Entries</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {typedIncome.length}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ErrorBanner searchParams={resolved} />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.35fr]">
        {/* Add income form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Add income</CardTitle>
            <CardDescription>
              Log money that came in this month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createIncomeAction} className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <Input
                  id="source"
                  name="source"
                  placeholder="Paycheck, Freelance, etc."
                  required
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
                    placeholder="2500.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="income_date">Date</Label>
                  <Input
                    id="income_date"
                    name="income_date"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full sm:w-fit">
                Add income
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Income list */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold">
                  This month&apos;s income
                </CardTitle>
                <CardDescription>
                  All income recorded for {monthLabel}.
                </CardDescription>
              </div>
              <Link
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href="/budgets"
              >
                Fund envelopes →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {typedIncome.length > 0 ? (
              <div className="space-y-2">
                {typedIncome.map((entry) => {
                  const earner =
                    entry.user_id && userById.get(entry.user_id)?.name;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/20 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <span className="truncate">{entry.source}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>
                            {new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                            }).format(new Date(`${entry.income_date}T00:00:00`))}
                          </span>
                          {earner ? (
                            <>
                              <span className="opacity-40">·</span>
                              <span>{earner}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatCurrency(Number(entry.amount))}
                        </span>
                        <form action={deleteIncomeAction}>
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
                <span className="text-4xl">💰</span>
                <p className="text-sm text-muted-foreground">
                  No income recorded this month yet.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
