"use client";

import { useState } from "react";
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
import { CategoryIcon } from "@/components/categories/category-icon";
import type { CategorySummary } from "@/lib/finance";
import { formatCurrency } from "@/lib/finance";

type MonthlyHistory = {
  month: string;
  label: string;
  amount: number;
};

type Props = {
  category: CategorySummary;
  history: MonthlyHistory[];
};

export function CategoryHistoryDialog({ category, history }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CategoryIcon icon={null} fallback={category.name[0]} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {category.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatCurrency(category.amount)}
          </div>
        </div>
        <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          View history →
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CategoryIcon icon={null} fallback={category.name[0]} />
              {category.name}
            </DialogTitle>
            <DialogDescription>
              Monthly spending history for {category.name.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>
          {history.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={history}
                  margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    formatter={(value) => formatCurrency(Number(value ?? 0))}
                    contentStyle={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      boxShadow:
                        "0 8px 24px color-mix(in oklch, var(--foreground) 10%, transparent)",
                    }}
                    labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                  <Bar
                    dataKey="amount"
                    fill="var(--primary)"
                    radius={[6, 6, 0, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No history available for this category.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
