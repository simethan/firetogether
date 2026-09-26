"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, selectClass } from "@/components/groups/shared";
import { saveExpenseAction } from "@/app/groups/[code]/expense-actions";
import type { EditorItem } from "@/lib/groups/editor-types";
import {
  computeAssignmentAmounts,
  computeExpenseTotal,
  evenPercentages,
  itemsSubtotal,
  round2,
  splitByWeights,
  validateItemSplit,
  type SplitMethod,
} from "@/lib/splitting";
import { cn } from "@/lib/utils";

type Member = { id: string; nickname: string };

export type EditorExpense = {
  id: string;
  merchant: string;
  date: string;
  currency: string;
  category: string;
  paidByMemberId: string;
  serviceChargePercent: number | null;
  taxPercent: number | null;
  discount: number;
  parseStatus: string;
};

export type EditorItemState = EditorItem & {
  key: string;
  locked: boolean;
  disputed: boolean;
};

type Props = {
  code: string;
  expense: EditorExpense;
  items: EditorItemState[];
  members: Member[];
  categories: readonly string[];
  currencies: readonly string[];
};

let keySeed = 0;
const newKey = () => `new-${++keySeed}`;

function lineTotal(item: EditorItem) {
  return round2((item.quantity || 0) * (item.unitPrice || 0));
}

/** Re-derive shares for the selected members when the split method or selection changes. */
function reshare(method: SplitMethod, memberIds: string[], total: number): Record<string, number> {
  if (memberIds.length === 0) return {};
  if (method === "equal") return Object.fromEntries(memberIds.map((id) => [id, 1]));
  if (method === "percentage") return Object.fromEntries(evenPercentages(memberIds));
  return Object.fromEntries(splitByWeights(total, memberIds.map((id) => ({ key: id, weight: 1 }))));
}

function toSplit(item: EditorItem) {
  return {
    lineTotal: lineTotal(item),
    splitMethod: item.splitMethod,
    assignments: Object.entries(item.shares).map(([memberId, share]) => ({ memberId, share })),
  };
}

export function ExpenseEditor({ code, expense, items: initialItems, members, categories, currencies }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [header, setHeader] = useState(expense);
  const [items, setItems] = useState(initialItems);
  const [bulkMembers, setBulkMembers] = useState<string[]>(members.map((m) => m.id));
  const [markVerified, setMarkVerified] = useState(false);
  const anyLocked = items.some((i) => i.locked);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.nickname ?? "Former member";

  const charges = {
    serviceChargePercent: header.serviceChargePercent,
    taxPercent: header.taxPercent,
    discount: header.discount || 0,
  };
  const splits = items.map(toSplit);
  const subtotal = itemsSubtotal(splits);
  const total = computeExpenseTotal(subtotal, charges);
  const unsplit = items.filter((i) => Object.keys(i.shares).length === 0).length;

  const perMember = new Map<string, number>();
  computeAssignmentAmounts(splits, total).forEach((shares) => {
    for (const [memberId, amount] of shares) perMember.set(memberId, (perMember.get(memberId) ?? 0) + amount);
  });
  const preview = [...perMember.entries()].sort((a, b) => b[1] - a[1]);

  function updateItem(key: string, patch: Partial<EditorItemState>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function toggleMember(item: EditorItemState, memberId: string) {
    const selected = Object.keys(item.shares);
    const next = selected.includes(memberId) ? selected.filter((id) => id !== memberId) : [...selected, memberId];
    updateItem(item.key, { shares: reshare(item.splitMethod, next, lineTotal(item)) });
  }

  function changeMethod(item: EditorItemState, method: SplitMethod) {
    updateItem(item.key, { splitMethod: method, shares: reshare(method, Object.keys(item.shares), lineTotal(item)) });
  }

  function applyBulk() {
    setItems((current) =>
      current.map((item) => (item.locked ? item : { ...item, splitMethod: "equal", shares: reshare("equal", bulkMembers, 0) })),
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      {
        key: newKey(),
        name: "",
        quantity: 1,
        unitPrice: 0,
        category: null,
        splitMethod: "equal",
        shares: {},
        locked: false,
        disputed: false,
      },
    ]);
  }

  function save() {
    startTransition(async () => {
      const result = await saveExpenseAction({
        code,
        expenseId: expense.id,
        merchant: header.merchant,
        date: header.date,
        currency: header.currency,
        category: header.category,
        paidByMemberId: header.paidByMemberId,
        serviceChargePercent: header.serviceChargePercent,
        taxPercent: header.taxPercent,
        discount: header.discount,
        markVerified,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          category: item.category,
          splitMethod: item.splitMethod,
          shares: item.shares,
        })),
      });
      if (result.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="merchant">Merchant</Label>
          <Input id="merchant" value={header.merchant} onChange={(e) => setHeader({ ...header, merchant: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-date">Date</Label>
          <Input
            id="expense-date"
            type="date"
            value={header.date}
            onChange={(e) => setHeader({ ...header, date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-category">Category</Label>
          <select
            id="expense-category"
            className={selectClass}
            value={header.category}
            onChange={(e) => setHeader({ ...header, category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-paid-by">Paid by</Label>
          <select
            id="expense-paid-by"
            className={selectClass}
            value={header.paidByMemberId}
            disabled={anyLocked}
            onChange={(e) => setHeader({ ...header, paidByMemberId: e.target.value })}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nickname}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="expense-currency">Currency</Label>
          <select
            id="expense-currency"
            className={selectClass}
            value={header.currency}
            disabled={anyLocked}
            onChange={(e) => setHeader({ ...header, currency: e.target.value })}
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <p className="mb-2 text-sm font-medium">Split every item equally among:</p>
        <div className="flex flex-wrap items-center gap-2">
          {members.map((m) => {
            const on = bulkMembers.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setBulkMembers(on ? bulkMembers.filter((id) => id !== m.id) : [...bulkMembers, m.id])}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
                aria-pressed={on}
              >
                {m.nickname}
              </button>
            );
          })}
          <Button type="button" variant="secondary" size="sm" onClick={applyBulk} disabled={bulkMembers.length === 0}>
            Apply to all items
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Items</h3>
          <span className="text-xs text-muted-foreground">
            {unsplit ? `${unsplit} not split yet` : "Everything is split"}
          </span>
        </div>

        {items.map((item) => {
          const problem = validateItemSplit(toSplit(item));
          const selected = Object.keys(item.shares);
          return (
            <div
              key={item.key}
              className={cn(
                "space-y-3 rounded-2xl border p-4",
                item.locked ? "border-border/60 bg-muted/30" : "border-border bg-card",
                problem && "border-destructive/40",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={item.name}
                  placeholder="Item name"
                  disabled={item.locked}
                  onChange={(e) => updateItem(item.key, { name: e.target.value })}
                  className="min-w-40 flex-1"
                  aria-label="Item name"
                />
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={item.quantity}
                  disabled={item.locked}
                  onChange={(e) => updateItem(item.key, { quantity: Number(e.target.value) })}
                  className="w-20"
                  aria-label="Quantity"
                />
                <span className="text-muted-foreground">×</span>
                <Input
                  type="number"
                  step="0.01"
                  value={item.unitPrice}
                  disabled={item.locked}
                  onChange={(e) => updateItem(item.key, { unitPrice: Number(e.target.value) })}
                  className="w-28"
                  aria-label="Price"
                />
                <span className="w-24 text-right font-semibold tabular-nums">
                  {formatMoney(lineTotal(item), header.currency)}
                </span>
                {!item.locked ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setItems((current) => current.filter((i) => i.key !== item.key))}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {item.locked ? <Badge variant="outline">Locked by a payment</Badge> : null}
                {item.disputed ? <Badge variant="destructive">Disputed</Badge> : null}
                <select
                  className={cn(selectClass, "h-8 w-36")}
                  value={item.splitMethod}
                  disabled={item.locked}
                  onChange={(e) => changeMethod(item, e.target.value as SplitMethod)}
                  aria-label="Split method"
                >
                  <option value="equal">Split equally</option>
                  <option value="percentage">By percentage</option>
                  <option value="custom">Exact amounts</option>
                </select>
                <select
                  className={cn(selectClass, "h-8 w-44")}
                  value={item.category ?? ""}
                  disabled={item.locked}
                  onChange={(e) => updateItem(item.key, { category: e.target.value || null })}
                  aria-label="Item category"
                >
                  <option value="">Same as receipt</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const on = selected.includes(m.id);
                  return (
                    <span key={m.id} className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={item.locked}
                        onClick={() => toggleMember(item, m.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-60",
                          on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                        )}
                        aria-pressed={on}
                      >
                        {m.nickname}
                      </button>
                      {on && item.splitMethod !== "equal" ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={item.shares[m.id]}
                          disabled={item.locked}
                          onChange={(e) =>
                            updateItem(item.key, { shares: { ...item.shares, [m.id]: Number(e.target.value) } })
                          }
                          className="h-8 w-20"
                          aria-label={`${m.nickname} ${item.splitMethod === "percentage" ? "percent" : "amount"}`}
                        />
                      ) : null}
                    </span>
                  );
                })}
                {selected
                  .filter((id) => !members.some((m) => m.id === id))
                  .map((id) => (
                    <Badge key={id} variant="outline">
                      {nameOf(id)}
                    </Badge>
                  ))}
              </div>

              {selected.length === 0 ? (
                <p className="text-xs text-muted-foreground">No one selected — tap the people this item should be split between.</p>
              ) : null}
              {problem ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                  {problem}
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => updateItem(item.key, { shares: reshare(item.splitMethod, selected, lineTotal(item)) })}
                  >
                    Auto-fix
                  </button>
                </p>
              ) : null}
            </div>
          );
        })}

        <Button type="button" variant="outline" onClick={addItem}>
          Add item
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="service-charge">Service charge %</Label>
          <Input
            id="service-charge"
            type="number"
            step="0.01"
            min="0"
            disabled={anyLocked}
            value={header.serviceChargePercent ?? ""}
            onChange={(e) => setHeader({ ...header, serviceChargePercent: numberOrNull(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax">GST / tax %</Label>
          <Input
            id="tax"
            type="number"
            step="0.01"
            min="0"
            disabled={anyLocked}
            value={header.taxPercent ?? ""}
            onChange={(e) => setHeader({ ...header, taxPercent: numberOrNull(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="discount">Discount</Label>
          <Input
            id="discount"
            type="number"
            step="0.01"
            min="0"
            disabled={anyLocked}
            value={header.discount || ""}
            onChange={(e) => setHeader({ ...header, discount: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatMoney(subtotal, header.currency)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(total, header.currency)}</span>
          </div>
        </div>
        <div className="space-y-1 text-sm">
          {preview.length ? (
            preview.map(([memberId, amount]) => (
              <div key={memberId} className="flex justify-between">
                <span>{nameOf(memberId)}</span>
                <span className="tabular-nums">{formatMoney(amount, header.currency)}</span>
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">Not split yet</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save all"}
        </Button>
        {header.parseStatus === "parsed" ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={markVerified} onChange={(e) => setMarkVerified(e.target.checked)} />
            Items match the receipt (mark verified)
          </label>
        ) : null}
      </div>
    </div>
  );
}
