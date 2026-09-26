import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BalanceText, EmptyState, MemberAvatar, formatDay, formatMoney, selectClass } from "@/components/groups/shared";
import { groupPath, memberName, type GroupContext, type GroupData } from "@/lib/groups/server";
import { SUPPORTED_CURRENCIES } from "@/lib/groups/types";
import {
  computeBalances,
  directDebts,
  ledgerTotals,
  memberLedger,
  memberShares,
  missingRates,
  settlementPlan,
} from "@/lib/splitting";
import { deletePaymentAction, recordPaymentAction, resolvePaymentAction } from "../settle-actions";

export function BalancesTab({
  context,
  data,
  selectedMemberId,
}: {
  context: GroupContext;
  data: GroupData;
  selectedMemberId?: string;
}) {
  const { group, me, isAdmin, members, allMembers } = context;
  const balances = computeBalances(data.ledgerExpenses, data.ledgerPayments, data.options);
  const plan = settlementPlan(data.ledgerExpenses, data.ledgerPayments, { ...data.options, simplify: group.simplify_debts });
  const direct = directDebts(data.ledgerExpenses, data.ledgerPayments, data.options);
  const missing = missingRates(data.ledgerExpenses, data.ledgerPayments, data.options);
  const pending = data.payments.filter((p) => p.status === "pending");
  const history = data.payments.filter((p) => p.status !== "pending");
  const name = (id: string | null) => memberName(allMembers, id);

  const selected = allMembers.find((m) => m.id === selectedMemberId) ?? null;
  const ledgerMember = selected ?? me;
  const ledger = ledgerMember ? memberLedger(ledgerMember.id, data.ledgerExpenses, data.ledgerPayments, data.options) : [];
  const ledgerSums = ledgerTotals(ledger);
  const inSync =
    ledgerMember &&
    Object.entries(balances).every(
      ([currency, perMember]) => Math.abs((perMember[ledgerMember.id] ?? 0) - (ledgerSums[currency] ?? 0)) < 0.01,
    );

  const balanceMembers = allMembers.filter(
    (m) => members.includes(m) || Object.values(balances).some((perMember) => Math.abs(perMember[m.id] ?? 0) > 0.005),
  );

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Everyone&apos;s balance</CardTitle>
            <CardDescription>Positive balance = others owe them. Negative = they owe others.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {missing.length ? (
              <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                No locked rate for {missing.join(", ")} yet, so those amounts are shown separately.
              </p>
            ) : null}
            {balanceMembers.map((member) => {
              const entries = Object.entries(balances).filter(([, perMember]) => Math.abs(perMember[member.id] ?? 0) > 0.005);
              return (
                <Link
                  key={member.id}
                  href={groupPath(group.code, `?tab=balances&member=${member.id}`)}
                  scroll={false}
                  className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 px-4 py-3 hover:bg-muted/40"
                >
                  <span className="flex items-center gap-3 font-medium text-foreground">
                    <MemberAvatar name={member.nickname} />
                    {member.nickname}
                    {member.id === me?.id ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                  </span>
                  <span className="text-right text-sm">
                    {entries.length ? (
                      entries.map(([currency, perMember]) => (
                        <div key={currency}>
                          <BalanceText amount={perMember[member.id]} currency={currency} />
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-foreground">Settled up</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">
              {group.simplify_debts ? "Simplified payments" : "Direct debts"}
            </CardTitle>
            <CardDescription>
              {group.simplify_debts
                ? direct.length > plan.length
                  ? `${direct.length} debts become ${plan.length} — fewer transfers, same total owed.`
                  : "The fewest transfers needed to settle everyone (greedy: largest match first)."
                : "Every individual debt between two people. Turn on simplified payments in Settings to reduce transfers."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {plan.length ? (
              plan.map((transfer) => {
                const canSettle = me && (transfer.from === me.id || transfer.to === me.id || isAdmin);
                return (
                  <div
                    key={`${transfer.from}-${transfer.to}-${transfer.currency}`}
                    className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        <span className="font-medium text-foreground">{name(transfer.from)}</span>
                        <span className="text-muted-foreground"> pays </span>
                        <span className="font-medium text-foreground">{name(transfer.to)}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatMoney(transfer.amount, transfer.currency)}</span>
                    </div>
                    {canSettle ? (
                      <form action={recordPaymentAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="code" value={group.code} />
                        <input type="hidden" name="payer_id" value={transfer.from} />
                        <input type="hidden" name="receiver_id" value={transfer.to} />
                        <input type="hidden" name="currency" value={transfer.currency} />
                        {isAdmin && transfer.from !== me.id && transfer.to !== me.id ? (
                          <input type="hidden" name="mark_settled" value="true" />
                        ) : null}
                        <Input
                          name="amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          defaultValue={transfer.amount.toFixed(2)}
                          className="h-8 w-32"
                          aria-label="Amount paid"
                        />
                        <Button type="submit" size="sm">
                          {transfer.to === me.id ? "Mark as received" : transfer.from === me.id ? "Settle up" : "Confirm settlement"}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <EmptyState>No outstanding debts — everyone is settled up!</EmptyState>
            )}
          </CardContent>
        </Card>

        {me ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Record a payment</CardTitle>
              <CardDescription>
                Payments you send wait for the receiver to approve. Payments you receive count straight away.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={recordPaymentAction} className="grid gap-4">
                <input type="hidden" name="code" value={group.code} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="payer_id">From</Label>
                    <select id="payer_id" name="payer_id" defaultValue={me.id} className={selectClass}>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nickname}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="receiver_id">To</Label>
                    <select id="receiver_id" name="receiver_id" className={selectClass}>
                      {members
                        .filter((m) => m.id !== me.id)
                        .concat(members.filter((m) => m.id === me.id))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nickname}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="payment-amount">Amount</Label>
                    <Input id="payment-amount" name="amount" type="number" step="0.01" min="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payment-currency">Currency</Label>
                    <select id="payment-currency" name="currency" defaultValue={group.base_currency} className={selectClass}>
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Input name="note" placeholder="Note (optional)" />
                {isAdmin ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="mark_settled" value="true" />
                    Mark as settled now (admin)
                  </label>
                ) : null}
                <Button type="submit" className="w-full sm:w-fit">
                  Record payment
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-5">
        {pending.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold">Pending approvals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pending.map((payment) => {
                const canResolve = me && (payment.receiver_member_id === me.id || isAdmin);
                return (
                  <div key={payment.id} className="space-y-2 rounded-2xl border border-border bg-muted/20 p-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{name(payment.payer_member_id)}</span> paid{" "}
                        <span className="font-medium">{name(payment.receiver_member_id)}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</span>
                    </div>
                    {payment.note ? <p className="text-muted-foreground">{payment.note}</p> : null}
                    {canResolve ? (
                      <div className="flex gap-2">
                        {(["approve", "reject"] as const).map((decision) => (
                          <form key={decision} action={resolvePaymentAction}>
                            <input type="hidden" name="code" value={group.code} />
                            <input type="hidden" name="payment_id" value={payment.id} />
                            <input type="hidden" name="decision" value={decision} />
                            <Button type="submit" size="sm" variant={decision === "approve" ? "default" : "ghost"}>
                              {decision === "approve" ? "Approve" : "Reject"}
                            </Button>
                          </form>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Waiting for {name(payment.receiver_member_id)} to approve.</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {ledgerMember && me ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-xl font-semibold">
                {selected && selected.id !== me.id ? `${selected.nickname}'s breakdown` : "Your IOU account"}
                {inSync ? (
                  <Badge className="border-emerald-200 bg-emerald-500/10 text-emerald-600">In sync</Badge>
                ) : (
                  <Badge variant="destructive">Out of sync</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Every movement in {selected && selected.id !== me.id ? "their" : "your"} group balance. The total always matches
                the balance above{selected && selected.id !== me.id ? "" : ", and syncs to Net Worth as an IOU account"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selected && selected.id !== me.id ? (
                <Link href={groupPath(group.code, "?tab=balances")} scroll={false} className="text-sm underline underline-offset-4">
                  Show my IOU account
                </Link>
              ) : null}
              {ledger.length ? (
                <div className="space-y-1.5">
                  {ledger.map((entry, index) => (
                    <div
                      key={`${entry.expenseId ?? entry.paymentId}-${entry.kind}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-muted/30"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          {entry.expenseId ? (
                            <Link href={groupPath(group.code, `/expenses/${entry.expenseId}`)} className="hover:underline">
                              {entry.description}
                            </Link>
                          ) : (
                            `${entry.description} · ${name(entry.counterpartyId ?? null)}`
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDay(entry.date)}
                          {entry.category ? ` · ${entry.category}` : ""}
                        </span>
                      </span>
                      <BalanceText amount={entry.amount} currency={entry.currency} className="font-medium" />
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                    <span>Total</span>
                    <span className="text-right">
                      {Object.entries(ledgerSums).map(([currency, amount]) => (
                        <div key={currency}>
                          <BalanceText amount={amount} currency={currency} />
                        </div>
                      ))}
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyState>Nothing yet.</EmptyState>
              )}
              {memberShares(ledgerMember.id, data.ledgerExpenses).length ? (
                <p className="text-xs text-muted-foreground">
                  Spent in total:{" "}
                  {Object.entries(
                    memberShares(ledgerMember.id, data.ledgerExpenses).reduce<Record<string, number>>((acc, row) => {
                      acc[row.expense.currency] = (acc[row.expense.currency] ?? 0) + row.amount;
                      return acc;
                    }, {}),
                  )
                    .map(([currency, amount]) => formatMoney(amount, currency))
                    .join(" + ")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Settlement history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.length ? (
              history.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block">
                      <span className="font-medium">{name(payment.payer_member_id)}</span> →{" "}
                      <span className="font-medium">{name(payment.receiver_member_id)}</span>
                      {payment.status === "rejected" ? (
                        <Badge variant="outline" className="ml-2">
                          Rejected
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDay(payment.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</span>
                    {me &&
                    (isAdmin || payment.payer_member_id === me.id || payment.recorded_by_member_id === me.id) ? (
                      <form action={deletePaymentAction}>
                        <input type="hidden" name="code" value={group.code} />
                        <input type="hidden" name="payment_id" value={payment.id} />
                        <button type="submit" className="text-xs text-muted-foreground hover:text-destructive">
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </span>
                </div>
              ))
            ) : (
              <EmptyState>No settled items yet.</EmptyState>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
