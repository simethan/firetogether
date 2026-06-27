import { Repeat2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RecurringExpense } from "@/lib/finance";
import { formatCurrency } from "@/lib/finance";

type Props = {
  recurring: RecurringExpense[];
};

export function RecurringExpenses({ recurring }: Props) {
  if (recurring.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <span className="text-4xl">🔄</span>
        <div>
          <p className="font-medium text-foreground">No recurring expenses detected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Expenses with the same category and amount appearing across months will show here.
          </p>
        </div>
      </div>
    );
  }

  const totalMonthly = recurring.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Detected recurring
        </h4>
        <span className="text-xs font-medium text-muted-foreground">
          ~{formatCurrency(totalMonthly)}/mo
        </span>
      </div>
      <ul className="space-y-2">
        {recurring.map((r, i) => (
          <li
            key={`${r.categoryName}-${r.amount}-${i}`}
            className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Repeat2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {r.categoryName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.description || "Same amount recurring"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(r.amount)}
              </p>
              <Badge variant="secondary" className="mt-0.5 text-[10px]">
                {r.monthsAppeared} mo.
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
