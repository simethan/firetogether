import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, MemberAvatar, formatMoney } from "@/components/groups/shared";
import { groupPath, type GroupContext } from "@/lib/groups/server";
import type { GroupActivity } from "@/lib/groups/types";

function describe(entry: GroupActivity): string {
  const m = entry.metadata as Record<string, string | number | boolean | undefined>;
  const money = typeof m.amount === "number" ? formatMoney(m.amount, String(m.currency ?? "SGD")) : "";
  switch (entry.action) {
    case "GROUP_CREATED":
      return "created the group";
    case "RECEIPT_UPLOADED":
      return m.manual ? "added an expense" : "uploaded a receipt";
    case "RECEIPT_EDITED":
      return "edited an expense";
    case "RECEIPT_DELETED":
      return `deleted ${m.merchant ? `"${m.merchant}"` : "an expense"}`;
    case "MEMBER_JOINED":
      return "joined the group";
    case "MEMBER_CLAIMED":
      return `claimed the name ${m.claimedName ?? ""}`.trim();
    case "MEMBER_ADDED":
      return `added ${m.addedName ?? "a person"}`;
    case "MEMBER_RENAMED":
    case "MEMBER_RENAMED_BY_ADMIN":
      return `renamed ${m.previousNickname ?? "someone"} to ${m.nickname ?? ""}`;
    case "MEMBER_REMOVED":
      return `removed ${m.nickname ?? "someone"}`;
    case "MEMBER_BANNED":
      return `banned ${m.nickname ?? "someone"}`;
    case "MEMBER_LEFT":
      return "left the group";
    case "MEMBER_ROLE_CHANGED":
      return m.role === "admin" ? "made someone an admin" : "removed an admin";
    case "PAYMENT_RECORDED":
      return `recorded a payment${money ? ` of ${money}` : ""}${m.receiverName ? ` to ${m.receiverName}` : ""} (pending)`;
    case "PAYMENT_RECORDED_SETTLED":
      return `recorded ${m.payerName ?? "someone"} paying ${m.receiverName ?? "someone"}${money ? ` ${money}` : ""}`;
    case "PAYMENT_APPROVED":
      return `approved a payment${money ? ` of ${money}` : ""}`;
    case "PAYMENT_REJECTED":
      return `rejected a payment${money ? ` of ${money}` : ""}`;
    case "PAYMENT_DELETED":
      return `deleted a payment${money ? ` of ${money}` : ""}`;
    case "RATES_LOCKED":
      return "locked exchange rates";
    case "RATE_EDITED":
      return `set the ${m.currency ?? ""} rate`;
    case "ITEM_DISPUTED":
      return `disputed "${m.itemName ?? "an item"}"`;
    case "DISPUTE_RESOLVED":
      return `resolved the dispute on "${m.itemName ?? "an item"}"`;
    case "DISPUTE_REMOVED":
      return `removed the dispute on "${m.itemName ?? "an item"}"`;
    case "COMMENT_ADDED":
      return "commented on an expense";
    case "BUDGET_CREATED":
      return "added a spending budget";
    case "RECURRING_CREATED":
      return `set up "${m.name ?? "a recurring expense"}"`;
    case "RECURRING_POSTED":
      return `posted "${m.name ?? "a recurring expense"}"`;
    case "RECURRING_DELETED":
      return `removed "${m.name ?? "a recurring expense"}"`;
    case "GROUP_SETTINGS_UPDATED":
      return "updated the group settings";
    default:
      return entry.action.toLowerCase().replace(/_/g, " ");
  }
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

export async function ActivityTab({ context }: { context: GroupContext }) {
  const { admin, group } = context;
  const { data } = await admin
    .from("group_activity")
    .select("id, group_id, member_id, actor_name, action, metadata, created_at")
    .eq("group_id", group.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const entries = (data ?? []) as GroupActivity[];
  const { data: existing } = await admin.from("group_expenses").select("id").eq("group_id", group.id);
  const expenseIds = new Set((existing ?? []).map((e: { id: string }) => e.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Timeline</CardTitle>
        <CardDescription>Everything that happened in {group.name}, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length ? (
          <ol className="space-y-3">
            {entries.map((entry) => {
              const receiptId = typeof entry.metadata.receiptId === "string" ? entry.metadata.receiptId : null;
              return (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <MemberAvatar name={entry.actor_name} />
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-medium text-foreground">{entry.actor_name}</span>{" "}
                      <span className="text-muted-foreground">{describe(entry)}</span>
                      {receiptId && expenseIds.has(receiptId) ? (
                        <>
                          {" · "}
                          <Link href={groupPath(group.code, `/expenses/${receiptId}`)} className="underline underline-offset-4">
                            view
                          </Link>
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatTimestamp(entry.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState>No activity yet.</EmptyState>
        )}
      </CardContent>
    </Card>
  );
}
