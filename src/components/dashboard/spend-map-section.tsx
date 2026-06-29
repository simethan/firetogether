"use client";

import { useState } from "react";

import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { CategoryHistoryDialog } from "@/components/dashboard/category-history-dialog";
import { computeCategoryHistory } from "@/lib/finance";
import type { CategorySummary } from "@/lib/finance";
import type { Category, Expense, User } from "@/lib/types";

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

  return (
    <>
      {/* Category bar chart — bars trigger the dialog */}
      <DashboardCharts
        data={filteredCategorySummaries}
        onCategoryClick={(catId) => setActiveCategoryId(catId)}
      />

      {/* Category list with history dialog */}
      {filteredCategorySummaries.length > 0 ? (
        <div className="mt-4 divide-y divide-border/70 border-t border-border/70 pt-4">
          {filteredCategorySummaries.map((cat) => {
            const history = computeCategoryHistory(
              typedMultiMonthExpenses,
              cat.categoryId,
              multiMonths,
            );
            const categoryExpenses = typedMonthlyExpenses.filter(
              (e) => (e.category_id ?? null) === cat.categoryId,
            );
            return (
              <CategoryHistoryDialog
                key={cat.categoryId ?? "__uncat__"}
                category={cat}
                history={history}
                expenses={categoryExpenses}
                users={userById}
                currentUserId={currentUserId}
              />
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

      {/* Standalone dialog triggered by chart bar clicks */}
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
