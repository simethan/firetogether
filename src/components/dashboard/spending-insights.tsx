import {
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

import type { SpendingInsight } from "@/lib/finance";
import { formatCurrency } from "@/lib/finance";

type Props = {
  insights: SpendingInsight[];
};

function InsightIcon({ type }: { type: SpendingInsight["type"] }) {
  switch (type) {
    case "increase":
      return <ArrowUpRight className="h-4 w-4 text-chart-4" />;
    case "decrease":
      return <ArrowDownRight className="h-4 w-4 text-chart-3" />;
    case "new":
      return <Sparkles className="h-4 w-4 text-primary" />;
  }
}

export function SpendingInsights({ insights }: Props) {
  if (insights.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <span className="text-4xl">📊</span>
        <div>
          <p className="font-medium text-foreground">No insights yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare spending across months to see trends and changes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {insights.map((insight, i) => (
        <li
          key={`${insight.type}-${insight.categoryName}-${i}`}
          className="flex items-start gap-3 rounded-xl bg-muted/30 px-3 py-2.5"
        >
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background">
            <InsightIcon type={insight.type} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">{insight.message}</p>
            {insight.currentAmount > 0 && (
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {formatCurrency(insight.currentAmount)}
                {insight.previousAmount > 0 &&
                  ` (was ${formatCurrency(insight.previousAmount)})`}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
