"use client";

import { useState, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CategoryIcon } from "@/components/categories/category-icon";
import { cn } from "@/lib/utils";
import type { CategorySummary, MonthlyHistory } from "@/lib/finance";
import { formatCurrency, getShareForExpense, formatShortDate } from "@/lib/finance";
import type { Expense, User } from "@/lib/types";

type Props = {
  category: CategorySummary;
  history: MonthlyHistory[];
  expenses: Expense[];
  users: Map<string, User>;
  currentUserId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const PAYER_FILTERS = [
  { value: "all", label: "All" },
  { value: "me", label: "Me" },
  { value: "partner", label: "Partner" },
] as const;

type PayerFilter = (typeof PAYER_FILTERS)[number]["value"];

export function CategoryHistoryDialog({
  category,
  history,
  expenses,
  users,
  currentUserId,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [payerFilter, setPayerFilter] = useState<PayerFilter>("all");
  const open = externalOpen ?? internalOpen;
  const setOpen = externalOnOpenChange ?? setInternalOpen;

  // Reset filter when dialog opens
  const handleOpenChange = (next: boolean) => {
    if (next) setPayerFilter("all");
    setOpen(next);
  };

  const filteredExpenses = useMemo(() => {
    if (payerFilter === "all") return expenses;
    if (payerFilter === "me") return expenses.filter((e) => e.user_id === currentUserId);
    return expenses.filter((e) => e.user_id !== currentUserId);
  }, [expenses, payerFilter, currentUserId]);

  return (
    <>
      {externalOpen === undefined && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted/50"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CategoryIcon icon={null} fallback={category.name[0]} />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="min-w-0 shrink-0">
              <div className="truncate text-sm font-medium text-foreground">
                {category.name}
              </div>
            </div>
            {/* Mini historical bar sparkline */}
            {history.length > 0 && (
              <div className="hidden min-w-0 flex-1 sm:flex items-end gap-px h-7 px-2">
                {(() => {
                  const maxAmount = Math.max(...history.map((h) => h.amount));
                  return history.map((h) => {
                    const pct =
                      maxAmount > 0 ? (h.amount / maxAmount) * 100 : 0;
                    return (
                      <div
                        key={h.month}
                        className="flex-1 rounded-t-[1.5px] bg-primary/35 transition-all group-hover:bg-primary/50"
                        style={{ height: `${Math.max(pct, 3)}%` }}
                      />
                    );
                  });
                })()}
              </div>
            )}
          </div>
          <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
            {formatCurrency(category.amount)}
          </span>
        </button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-md">
          <DialogHeader className="pb-1">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CategoryIcon icon={null} fallback={category.name[0]} />
              {category.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Monthly spending history for {category.name.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>

          {/* Chart — scrolls naturally with content */}
          <div className="overflow-y-auto pr-1">
            {/* Payer total — prominent number when filtered */}
            {expenses.length > 0 && (
              <div className="mb-3">
                {payerFilter === "all" ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                      Total spent
                    </span>
                    <span className="text-lg font-bold tabular-nums text-foreground">
                      {formatCurrency(
                        filteredExpenses.reduce((t, e) => t + Number(e.amount), 0),
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                          {payerFilter === "me" ? "Y" : "P"}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-foreground">
                            {payerFilter === "me" ? "You paid" : "Partner paid"}
                          </div>
                          <div className="text-[10px] text-muted-foreground/70">
                            Current month
                          </div>
                        </div>
                      </div>
                      <span className="text-xl font-bold tabular-nums text-foreground">
                        {formatCurrency(
                          filteredExpenses.reduce(
                            (t, e) => t + Number(e.amount),
                            0,
                          ),
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {history.length > 0 ? (
              <div className="min-h-[112px] h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={history}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v}`}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      formatter={(value) => formatCurrency(Number(value ?? 0))}
                      contentStyle={{
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 12,
                        boxShadow:
                          "0 8px 24px color-mix(in oklch, var(--foreground) 10%, transparent)",
                      }}
                      labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                      itemStyle={{ color: "var(--foreground)" }}
                    />
                    <Bar
                      dataKey="amount"
                      fill={
                        payerFilter === "all"
                          ? "var(--primary)"
                          : payerFilter === "me"
                            ? "var(--chart-2)"
                            : "var(--chart-5)"
                      }
                      radius={[4, 4, 0, 0]}
                      barSize={20}
                    />
                  </BarChart>
                </ResponsiveContainer>
                {payerFilter !== "all" && (
                  <p className="mt-1 text-center text-[10px] text-muted-foreground/60">
                    Full history · filtered total shown above
                  </p>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No history available for this category.
              </p>
            )}

            {expenses.length > 0 && (
              <>
                <Separator className="my-3" />

                {/* Payer filter + count header */}
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
                    {PAYER_FILTERS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setPayerFilter(f.value)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                          payerFilter === f.value
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {filteredExpenses.length} of {expenses.length} expense
                    {expenses.length === 1 ? "" : "s"}
                  </span>
                </div>

                {/* Expenses list — scrollable if needed */}
                <div className="space-y-1">
                  {filteredExpenses.length > 0 ? (
                    filteredExpenses.map((expense) => {
                      const payer = users.get(expense.user_id ?? "");
                      const isMine = expense.user_id === currentUserId;
                      const { payer: payerShare } = getShareForExpense(expense);

                      return (
                        <div
                          key={expense.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/50 px-2.5 py-2 text-xs"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                              {formatShortDate(expense.expense_date)}
                            </span>
                            <span className="truncate text-foreground">
                              {expense.description || "No description"}
                            </span>
                            <Badge
                              variant={isMine ? "default" : "secondary"}
                              className="shrink-0 text-[9px] font-normal leading-none px-1.5 py-0.5"
                            >
                              {payer?.name ?? "Unknown"}
                            </Badge>
                            {expense.split_type !== "personal" && (
                              <span className="shrink-0 text-[9px] text-muted-foreground">
                                {expense.split_type === "custom"
                                  ? `${Math.round((expense.custom_ratio ?? 0.5) * 100)}/${Math.round((1 - (expense.custom_ratio ?? 0.5)) * 100)}`
                                  : "50/50"}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="font-mono font-medium tabular-nums text-foreground">
                              {formatCurrency(expense.amount)}
                            </span>
                            {expense.split_type !== "personal" && (
                              <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
                                your share: {formatCurrency(payerShare)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="py-4 text-center text-[11px] text-muted-foreground">
                      {payerFilter === "me"
                        ? "No expenses paid by you in this category this month."
                        : "No expenses paid by your partner in this category this month."}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
