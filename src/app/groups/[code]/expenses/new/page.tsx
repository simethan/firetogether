import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banners, selectClass } from "@/components/groups/shared";
import { getGroupContext, groupPath } from "@/lib/groups/server";
import { GROUP_CATEGORIES, SUPPORTED_CURRENCIES } from "@/lib/groups/types";
import { createManualExpenseAction } from "../../expense-actions";

export default async function NewGroupExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const context = await getGroupContext(code);
  if (!context) notFound();
  const { group, me, members, authUserId } = context;
  if (!authUserId) redirect(`/login?next=${encodeURIComponent(groupPath(group.code, "/expenses/new"))}`);
  if (!me) redirect(groupPath(group.code));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
      <Link href={groupPath(group.code)} className="text-sm text-muted-foreground hover:text-foreground">
        ← {group.name}
      </Link>
      <Banners error={error} />
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Add an expense</CardTitle>
          <CardDescription>Split equally between the people you pick. Edit it afterwards for item-level splits.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createManualExpenseAction} className="grid gap-4">
            <input type="hidden" name="code" value={group.code} />
            <div className="space-y-2">
              <Label htmlFor="description">What was it?</Label>
              <Input id="description" name="description" placeholder="Taxi to the airport" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <select id="currency" name="currency" defaultValue={group.base_currency} className={selectClass}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select id="category" name="category" defaultValue="Food & Dining" className={selectClass}>
                  {GROUP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paid_by">Paid by</Label>
                <select id="paid_by" name="paid_by" defaultValue={me.id} className={selectClass}>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nickname}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Split with</legend>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary"
                  >
                    <input type="checkbox" name="split_between" value={m.id} defaultChecked className="sr-only" />
                    {m.nickname}
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" className="w-full sm:w-fit">
              Add expense
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
