import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ExpenseEditor, type EditorItemState } from "@/components/groups/expense-editor";
import { Banners, EmptyState, formatDay, formatMoney } from "@/components/groups/shared";
import { RECEIPT_BUCKET } from "@/lib/groups/receipts";
import { getGroupContext, groupPath, loadGroupData, memberName } from "@/lib/groups/server";
import { GROUP_CATEGORIES, SUPPORTED_CURRENCIES, type GroupComment } from "@/lib/groups/types";
import { allocatePayments, lockedItemIds } from "@/lib/splitting";
import { deleteExpenseAction, retryReceiptAction } from "../../expense-actions";
import { addCommentAction, disputeItemAction } from "../../extras-actions";

export default async function GroupExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string; id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { code, id } = await params;
  const { error, notice } = await searchParams;
  const context = await getGroupContext(code);
  if (!context) notFound();
  const { admin, group, me, members, allMembers, authUserId } = context;
  const selfPath = groupPath(group.code, `/expenses/${id}`);
  if (!authUserId) redirect(`/login?next=${encodeURIComponent(selfPath)}`);
  if (!me) redirect(groupPath(group.code));

  const data = await loadGroupData(admin, group);
  const expense = data.expenses.find((e) => e.id === id);
  if (!expense) notFound();

  const items = data.items.filter((i) => i.expense_id === expense.id);
  const locked = lockedItemIds(allocatePayments(data.ledgerExpenses, data.ledgerPayments));
  const reading = expense.parse_status === "pending_ocr" || expense.parse_status === "processing";

  const [{ data: signed }, { data: commentRows }] = await Promise.all([
    expense.receipt_path
      ? admin.storage.from(RECEIPT_BUCKET).createSignedUrl(expense.receipt_path, 600)
      : Promise.resolve({ data: null }),
    admin
      .from("group_comments")
      .select("id, group_id, expense_id, member_id, body, created_at")
      .eq("expense_id", expense.id)
      .order("created_at", { ascending: true }),
  ]);
  const comments = (commentRows ?? []) as GroupComment[];

  const editorItems: EditorItemState[] = items.map((item) => ({
    key: item.id,
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    category: item.category,
    splitMethod: item.split_method,
    shares: Object.fromEntries(
      data.assignments.filter((a) => a.item_id === item.id).map((a) => [a.member_id, a.share]),
    ),
    locked: locked.has(item.id),
    disputed: item.dispute_status === "open",
  }));

  const editorMembers = [
    ...members,
    ...allMembers.filter(
      (m) => !members.includes(m) && data.assignments.some((a) => a.member_id === m.id && items.some((i) => i.id === a.item_id)),
    ),
  ].map((m) => ({ id: m.id, nickname: m.nickname }));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      <Link href={groupPath(group.code)} className="text-sm text-muted-foreground hover:text-foreground">
        ← {group.name}
      </Link>
      <Banners error={error} notice={notice} />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              {expense.merchant || expense.category}
              {expense.parse_status === "verified" ? (
                <Badge className="border-emerald-200 bg-emerald-500/10 text-emerald-600">Verified</Badge>
              ) : null}
              {expense.kind === "recurring" ? <Badge variant="outline">Recurring</Badge> : null}
            </CardTitle>
            <CardDescription>
              {formatDay(expense.expense_date)} · {formatMoney(expense.total, expense.currency)} · paid by{" "}
              {memberName(allMembers, expense.paid_by_member_id)} · added by{" "}
              {memberName(allMembers, expense.created_by_member_id)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {expense.parse_note ? (
              <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                {expense.parse_note}
              </p>
            ) : null}
            {reading ? (
              <EmptyState>
                Reading this receipt… No action needed — it stays on this screen.{" "}
                <Link href={selfPath} className="underline underline-offset-4">
                  Refresh
                </Link>
              </EmptyState>
            ) : (
              <ExpenseEditor
                key={JSON.stringify([editorItems, expense.total, expense.paid_by_member_id, expense.parse_status])}
                code={group.code}
                expense={{
                  id: expense.id,
                  merchant: expense.merchant ?? "",
                  date: expense.expense_date,
                  currency: expense.currency,
                  category: expense.category,
                  paidByMemberId: expense.paid_by_member_id ?? me.id,
                  serviceChargePercent: expense.service_charge_percent,
                  taxPercent: expense.tax_percent,
                  discount: expense.discount,
                  parseStatus: expense.parse_status,
                }}
                items={editorItems}
                members={editorMembers}
                categories={GROUP_CATEGORIES}
                currencies={SUPPORTED_CURRENCIES}
              />
            )}
            {expense.parse_status === "failed" && expense.receipt_path && items.length === 0 ? (
              <form action={retryReceiptAction}>
                <input type="hidden" name="code" value={group.code} />
                <input type="hidden" name="expense_id" value={expense.id} />
                <Button type="submit" variant="outline">
                  Try reading again
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {signed?.signedUrl ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Receipt</CardTitle>
              </CardHeader>
              <CardContent>
                {expense.receipt_content_type === "application/pdf" ? (
                  <a href={signed.signedUrl} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">
                    Open PDF
                  </a>
                ) : (
                  <a href={signed.signedUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                    <img src={signed.signedUrl} alt="Receipt" className="w-full rounded-xl border border-border" />
                  </a>
                )}
              </CardContent>
            </Card>
          ) : null}

          {items.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Disputes</CardTitle>
                <CardDescription>Flag an item that looks wrong. The payer or an admin can resolve it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="space-y-2 rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{item.name}</span>
                      {item.dispute_status === "open" ? (
                        <Badge variant="destructive">Disputed</Badge>
                      ) : item.dispute_status === "resolved" ? (
                        <Badge variant="outline">Resolved</Badge>
                      ) : null}
                    </div>
                    {item.dispute_status === "open" ? (
                      <>
                        <p className="text-muted-foreground">
                          {memberName(allMembers, item.disputed_by_member_id)}: {item.dispute_reason || "No reason given"}
                        </p>
                        <div className="flex gap-2">
                          <form action={disputeItemAction}>
                            <input type="hidden" name="code" value={group.code} />
                            <input type="hidden" name="item_id" value={item.id} />
                            <input type="hidden" name="action" value="resolve" />
                            <Button type="submit" size="sm" variant="outline">
                              Resolve
                            </Button>
                          </form>
                          <form action={disputeItemAction}>
                            <input type="hidden" name="code" value={group.code} />
                            <input type="hidden" name="item_id" value={item.id} />
                            <input type="hidden" name="action" value="remove" />
                            <Button type="submit" size="sm" variant="ghost">
                              Remove dispute
                            </Button>
                          </form>
                        </div>
                      </>
                    ) : (
                      <form action={disputeItemAction} className="flex gap-2">
                        <input type="hidden" name="code" value={group.code} />
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="action" value="open" />
                        <Input name="reason" placeholder="What's wrong?" className="h-8" />
                        <Button type="submit" size="sm" variant="ghost">
                          Dispute
                        </Button>
                      </form>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Comments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comments.length ? (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl bg-muted/30 px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground">
                      {memberName(allMembers, comment.member_id)} · {formatDay(comment.created_at)}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
              <form action={addCommentAction} className="flex gap-2">
                <input type="hidden" name="code" value={group.code} />
                <input type="hidden" name="expense_id" value={expense.id} />
                <Input name="body" placeholder="Add a comment" required maxLength={2000} />
                <Button type="submit" variant="outline">
                  Post
                </Button>
              </form>
            </CardContent>
          </Card>

          <form action={deleteExpenseAction}>
            <input type="hidden" name="code" value={group.code} />
            <input type="hidden" name="expense_id" value={expense.id} />
            <Button type="submit" variant="destructive">
              Delete expense
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
