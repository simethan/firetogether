import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReceiptUploader } from "@/components/groups/receipt-uploader";
import { EmptyState, formatDay, formatMoney, selectClass } from "@/components/groups/shared";
import { groupPath, memberName, type GroupContext, type GroupData } from "@/lib/groups/server";
import type { GroupExpense } from "@/lib/groups/types";

function statusBadge(expense: GroupExpense, unassigned: number, itemCount: number) {
  if (expense.parse_status === "pending_ocr" || expense.parse_status === "processing") {
    return <Badge className="border-amber-200 bg-amber-500/10 text-amber-600">Reading…</Badge>;
  }
  if (expense.parse_status === "failed") return <Badge variant="destructive">Needs review</Badge>;
  if (itemCount === 0 || unassigned === itemCount) return <Badge variant="outline">Not split yet</Badge>;
  if (unassigned > 0) return <Badge className="border-amber-200 bg-amber-500/10 text-amber-600">Needs splitting</Badge>;
  return <Badge className="border-emerald-200 bg-emerald-500/10 text-emerald-600">Split</Badge>;
}

export function ExpensesTab({
  context,
  data,
  query,
  category,
}: {
  context: GroupContext;
  data: GroupData;
  query?: string;
  category?: string;
}) {
  const { group, me, allMembers, members } = context;
  const categories = [...new Set(data.expenses.map((e) => e.category))].sort();
  const needle = query?.trim().toLowerCase() ?? "";

  const itemsByExpense = new Map<string, string[]>();
  for (const item of data.items) {
    const list = itemsByExpense.get(item.expense_id) ?? [];
    list.push(item.id);
    itemsByExpense.set(item.expense_id, list);
  }
  const assignedItems = new Set(data.assignments.map((a) => a.item_id));
  const myShareByItem = new Map<string, number>();
  if (me) {
    for (const a of data.assignments) if (a.member_id === me.id) myShareByItem.set(a.item_id, a.amount);
  }
  const disputedExpenses = new Set(data.items.filter((i) => i.dispute_status === "open").map((i) => i.expense_id));

  const visible = data.expenses.filter((expense) => {
    if (category && expense.category !== category) return false;
    if (!needle) return true;
    const itemNames = data.items.filter((i) => i.expense_id === expense.id).map((i) => i.name.toLowerCase());
    return (
      (expense.merchant ?? "").toLowerCase().includes(needle) ||
      expense.category.toLowerCase().includes(needle) ||
      itemNames.some((name) => name.includes(needle))
    );
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
      {me ? (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Upload a receipt or payment</CardTitle>
              <CardDescription>Snap it, then tag people on each item.</CardDescription>
            </CardHeader>
            <CardContent>
              <ReceiptUploader
                code={group.code}
                meId={me.id}
                members={members.map((m) => ({ id: m.id, nickname: m.nickname }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">No receipt?</CardTitle>
              <CardDescription>Add a manual expense and split it between people.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={groupPath(group.code, "/expenses/new")}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
              >
                Add an expense
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className={me ? undefined : "xl:col-span-2"}>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Expenses</CardTitle>
          <CardDescription>
            {data.expenses.length} total{me ? " · your share shown on the right" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap gap-2" action={groupPath(group.code)}>
            <Input name="q" defaultValue={query ?? ""} placeholder="Search receipts" className="max-w-xs" />
            <select name="category" defaultValue={category ?? ""} className={`${selectClass} max-w-52`}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>

          {visible.length ? (
            <div className="space-y-2">
              {visible.map((expense) => {
                const itemIds = itemsByExpense.get(expense.id) ?? [];
                const unassigned = itemIds.filter((id) => !assignedItems.has(id)).length;
                const myShare = itemIds.reduce((sum, id) => sum + (myShareByItem.get(id) ?? 0), 0);
                const row = (
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                        <span className="truncate">{expense.merchant || expense.category}</span>
                        {statusBadge(expense, unassigned, itemIds.length)}
                        {disputedExpenses.has(expense.id) ? <Badge variant="destructive">Disputed</Badge> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        <span>{formatDay(expense.expense_date)}</span>
                        <span className="opacity-40">·</span>
                        <span>{expense.category}</span>
                        <span className="opacity-40">·</span>
                        <span>Paid by {memberName(allMembers, expense.paid_by_member_id)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums text-foreground">
                        {formatMoney(expense.total, expense.currency)}
                      </div>
                      {me && myShare > 0 ? (
                        <div className="text-xs tabular-nums text-muted-foreground">
                          You: {formatMoney(myShare, expense.currency)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
                return me ? (
                  <Link key={expense.id} href={groupPath(group.code, `/expenses/${expense.id}`)} className="block">
                    {row}
                  </Link>
                ) : (
                  <div key={expense.id}>{row}</div>
                );
              })}
            </div>
          ) : (
            <EmptyState>
              {data.expenses.length ? "No receipts match your search." : "Add a receipt or manual expense to see totals."}
            </EmptyState>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
