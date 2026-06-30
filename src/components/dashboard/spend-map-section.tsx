"use client";

import { useState, useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { CategoryHistoryDialog } from "@/components/dashboard/category-history-dialog";
import { CategoryIcon } from "@/components/categories/category-icon";
import { computeCategoryHistory, formatCurrency } from "@/lib/finance";
import type { CategorySummary } from "@/lib/finance";
import type { Category, Expense, User } from "@/lib/types";

const chartColors = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type Props = {
  filteredCategorySummaries: CategorySummary[];
  typedMultiMonthExpenses: Expense[];
  multiMonths: string[];
  typedMonthlyExpenses: Expense[];
  userById: Map<string, User>;
  currentUserId: string;
  categoryFilter: string | null;
  categoryById: Map<string, Category>;
  monthLabel: string;
};

export function SpendMapSection({
  filteredCategorySummaries,
  typedMultiMonthExpenses,
  multiMonths,
  typedMonthlyExpenses,
  userById,
  currentUserId,
  categoryFilter,
  categoryById,
  monthLabel,
}: Props) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const activeCategory = activeCategoryId
    ? filteredCategorySummaries.find(
        (c) => c.categoryId === activeCategoryId,
      ) ?? null
    : null;
  const activeHistory =
    activeCategoryId && activeCategory
      ? computeCategoryHistory(
          typedMultiMonthExpenses,
          activeCategoryId,
          multiMonths,
        )
      : [];
  const activeExpenses = activeCategoryId
    ? typedMonthlyExpenses.filter(
        (e) => (e.category_id ?? null) === activeCategoryId,
      )
    : [];

  // Pre-compute histories for all categories to avoid recalculating on every render
  const histories = useMemo(
    () =>
      new Map(
        filteredCategorySummaries.map((cat) => [
          cat.categoryId,
          computeCategoryHistory(
            typedMultiMonthExpenses,
            cat.categoryId,
            multiMonths,
          ),
        ]),
      ),
    [filteredCategorySummaries, typedMultiMonthExpenses, multiMonths],
  );

  return (
    <>
      {/* Category bar chart — bars trigger the dialog */}
      <DashboardCharts
        data={filteredCategorySummaries}
        onCategoryClick={(catId) => setActiveCategoryId(catId)}
      />

      {/* Category list with inline historical charts */}
      {filteredCategorySummaries.length > 0 ? (
        <div className="mt-4 space-y-2 border-t border-border/70 pt-4">
          {filteredCategorySummaries.map((cat, index) => {
            const history = histories.get(cat.categoryId) ?? [];
            const color = cat.categoryId
              ? chartColors[index % chartColors.length]
              : "var(--muted-foreground)";
            const maxAmount =
              history.length > 0
                ? Math.max(...history.map((h) => h.amount), 1)
                : 1;

            return (
              <button
                key={cat.categoryId ?? "__uncat__"}
                type="button"
                onClick={() => setActiveCategoryId(cat.categoryId)}
                className="group flex w-full items-center gap-4 rounded-xl p-3 text-left transition-all hover:bg-muted/50 active:scale-[0.99]"
              >
                {/* Icon + name block */}
                <div className="flex shrink-0 items-center gap-3 min-w-0">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${color}15`, color }}
                  >
                    <CategoryIcon icon={null} fallback={cat.name[0]} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {cat.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground/60">
                      {history.length > 0
                        ? `${history.length}-month history`
                        : "no history"}
                    </div>
                  </div>
                </div>

                {/* Inline historical bar chart */}
                <div className="flex-1 min-w-0">
                  {history.length > 0 ? (
                    <div className="h-14 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={history}
                          margin={{ top: 0, right: 2, left: 2, bottom: 0 }}
                        >
                          <Tooltip
                            cursor={{ fill: "transparent" }}
                            formatter={(value) =>
                              formatCurrency(Number(value ?? 0))
                            }
                            labelFormatter={(label) => `${label}`}
                            contentStyle={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              padding: "4px 8px",
                              fontSize: 11,
                              boxShadow:
                                "0 8px 24px color-mix(in oklch, var(--foreground) 10%, transparent)",
                            }}
                            labelStyle={{
                              color: "var(--foreground)",
                              fontWeight: 600,
                            }}
                            itemStyle={{ color: "var(--foreground)" }}
                          />
                          <Bar
                            dataKey="amount"
                            radius={[3, 3, 0, 0]}
                            barSize={Math.min(
                              20,
                              Math.max(6, 120 / history.length),
                            )}
                          >
                            {history.map((entry) => (
                              <Cell
                                key={entry.month}
                                fill={color}
                                fillOpacity={
                                  maxAmount > 0
                                    ? 0.25 + (entry.amount / maxAmount) * 0.55
                                    : 0.3
                                }
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-14 items-center justify-center text-[11px] text-muted-foreground/40">
                      No prior data
                    </div>
                  )}
                </div>

                {/* Current month amount */}
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums text-foreground">
                    {formatCurrency(cat.amount)}
                  </div>
                  {cat.budget !== null && cat.budget > 0 && (
                    <div className="text-[10px] text-muted-foreground/60 tabular-nums">
                      of {formatCurrency(cat.budget)}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : categoryFilter ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          No spending found for{" "}
          <span className="font-medium text-foreground">
            {categoryById.get(categoryFilter)?.name ?? "this category"}
          </span>{" "}
          in {monthLabel}.
        </div>
      ) : null}

      {/* Standalone dialog triggered by chart bar clicks OR category list clicks */}
      {activeCategory && (
        <CategoryHistoryDialog
          key={`chart-dialog-${activeCategoryId}`}
          category={activeCategory}
          history={activeHistory}
          expenses={activeExpenses}
          users={userById}
          currentUserId={currentUserId}
          open
          onOpenChange={(o) => {
            if (!o) setActiveCategoryId(null);
          }}
        />
      )}
    </>
  );
}
