import { Calendar, Repeat2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { RecurringExpense } from "@/lib/finance";
import { formatCurrency } from "@/lib/finance";
import type { Category, ScheduledTransaction } from "@/lib/types";

type ScheduledDisplay = {
  id: string;
  categoryName: string;
  categoryIcon: string | null;
  amount: number;
  monthlyAmount: number;
  description: string | null;
  frequency: string;
  frequencyInterval: number;
  nextDate: string;
  isDueSoon: boolean;
  isActive: boolean;
};

type Props = {
  recurring: RecurringExpense[];
  scheduled: ScheduledDisplay[];
};

function nextDateLabel(nextDate: string, isDueSoon: boolean): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(nextDate);
  next.setHours(0, 0, 0, 0);

  const diff = Math.round(
    (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return `${diff} days`;
  return next.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function frequencyLabel(frequency: string, interval: number): string {
  if (interval <= 1) {
    return frequency === "monthly"
      ? "Monthly"
      : frequency === "weekly"
        ? "Weekly"
        : "Yearly";
  }
  return `Every ${interval} ${frequency.replace("ly", "")}s`;
}

function monthlyAmount(amount: number, frequency: string, interval: number): number {
  if (frequency === "weekly") return (Number(amount) * 4.33) / interval;
  if (frequency === "yearly") return Number(amount) / 12 / interval;
  return Number(amount) / interval;
}

export function buildScheduledDisplay(
  scheduled: ScheduledTransaction[],
  categoryById: Map<string, Category>,
): ScheduledDisplay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(today.getDate() + 3);

  return scheduled
    .filter((s) => s.is_active)
    .map((s) => {
      const category = s.category_id ? categoryById.get(s.category_id) : null;
      const next = new Date(s.next_date);
      next.setHours(0, 0, 0, 0);

      return {
        id: s.id,
        categoryName: category?.name ?? "Uncategorized",
        categoryIcon: category?.icon ?? null,
        amount: Number(s.amount),
        monthlyAmount: monthlyAmount(Number(s.amount), s.frequency, s.frequency_interval),
        description: s.description,
        frequency: s.frequency,
        frequencyInterval: s.frequency_interval,
        nextDate: s.next_date,
        isDueSoon: next >= today && next <= threeDaysFromNow,
        isActive: s.is_active,
      };
    })
    .sort(
      (a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime(),
    );
}

export function RecurringExpenses({ recurring, scheduled }: Props) {
  const hasRecurring = recurring.length > 0;
  const hasScheduled = scheduled.length > 0;

  if (!hasRecurring && !hasScheduled) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <span className="text-4xl">🔄</span>
        <div>
          <p className="font-medium text-foreground">No recurring expenses detected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Expenses with the same category and amount appearing across months will show here.
            Set up scheduled transactions to plan ahead.
          </p>
        </div>
      </div>
    );
  }

  const totalMonthlyRecurring = recurring.reduce((sum, r) => sum + r.amount, 0);
  const totalMonthlyScheduled = scheduled.reduce((sum, s) => sum + s.monthlyAmount, 0);

  return (
    <div className="space-y-3">
      {hasRecurring && (
        <>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detected recurring
            </h4>
            <span className="text-xs font-medium text-muted-foreground">
              ~{formatCurrency(totalMonthlyRecurring)}/mo
            </span>
          </div>
          <ul className="space-y-2">
            {recurring.map((r, i) => (
              <li
                key={`recurring-${r.categoryName}-${r.amount}-${i}`}
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
        </>
      )}

      {hasRecurring && hasScheduled && <Separator />}

      {hasScheduled && (
        <>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Scheduled bills
            </h4>
            <span className="text-xs font-medium text-muted-foreground">
              ~{formatCurrency(totalMonthlyScheduled)}/mo
            </span>
          </div>
          <ul className="space-y-2">
            {scheduled.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground">
                        {s.categoryName}
                      </p>
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          s.isDueSoon
                            ? "bg-amber-500"
                            : "bg-muted-foreground/30"
                        }`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {frequencyLabel(s.frequency, s.frequencyInterval)}
                      {s.description ? ` · ${s.description}` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(s.amount)}
                  </p>
                  <Badge
                    variant="outline"
                    className={`mt-0.5 text-[10px] ${
                      s.isDueSoon
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : ""
                    }`}
                  >
                    {nextDateLabel(s.nextDate, s.isDueSoon)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
