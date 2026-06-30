"use client";

import { Download } from "lucide-react";
import {
  expensesToCsv,
  categoriesToText,
  formatMonthLabel,
} from "@/lib/finance";

type ExpenseRow = {
  id: string;
  expense_date: string;
  description: string | null;
  category_name: string | null;
  amount: number;
  split_type: string;
  payer_name: string | null;
  my_share: number;
  partner_share: number;
  partner_name: string | null;
};

type CategoryRow = {
  name: string;
  total: number;
  myShare: number;
  shared: number;
  personal: number;
  count: number;
};

type Props = {
  expenses: ExpenseRow[];
  categories: CategoryRow[];
  month: string;
};

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons({ expenses, categories, month }: Props) {
  const monthLabel = formatMonthLabel(month);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          const csv = expensesToCsv(expenses);
          download(`expenses.csv`, csv, "text/csv;charset=utf-8;");
        }}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </button>
      <button
        type="button"
        onClick={() => {
          const text = `Categories — ${monthLabel}\n${"=".repeat(40)}\n\n${categoriesToText(categories)}`;
          download(`categories-${month}.txt`, text, "text/plain;charset=utf-8;");
        }}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Download className="h-3.5 w-3.5" />
        Categories
      </button>
    </div>
  );
}
