import { Flame, Trophy, Star, Heart, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { StreakInfo } from "@/lib/finance";

type Props = {
  streaks: StreakInfo;
  totalExpenses: number;
  hasSharedExpense: boolean;
};

const milestones = [
  { threshold: 1, label: "First expense", icon: Star, color: "text-chart-3" },
  { threshold: 10, label: "10 expenses", icon: Zap, color: "text-primary" },
  { threshold: 50, label: "50 expenses", icon: Flame, color: "text-chart-4" },
  { threshold: 100, label: "100 expenses", icon: Trophy, color: "text-chart-2" },
  { threshold: 250, label: "250 expenses", icon: Trophy, color: "text-chart-5" },
];

export function ExpenseStreaks({ streaks, totalExpenses, hasSharedExpense }: Props) {
  const earnedMilestones = milestones.filter(
    (m) => totalExpenses >= m.threshold
  );
  const nextMilestone = milestones.find(
    (m) => totalExpenses < m.threshold
  );

  return (
    <div className="space-y-4">
      {/* Streaks */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-xl bg-primary/5 p-4">
          <Flame className="h-5 w-5 text-primary" />
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {streaks.currentStreak}
          </span>
          <span className="text-xs text-muted-foreground">
            day{streaks.currentStreak !== 1 ? "s" : ""} streak
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl bg-chart-2/5 p-4">
          <Trophy className="h-5 w-5 text-chart-2" />
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {streaks.longestStreak}
          </span>
          <span className="text-xs text-muted-foreground">
            day{streaks.longestStreak !== 1 ? "s" : ""} best
          </span>
        </div>
      </div>

      {/* Milestones */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Milestones
        </h4>
        <div className="flex flex-wrap gap-2">
          {earnedMilestones.map((m) => {
            const Icon = m.icon;
            return (
              <Badge
                key={m.threshold}
                variant="secondary"
                className="gap-1.5 rounded-lg px-2.5 py-1"
              >
                <Icon className={`h-3.5 w-3.5 ${m.color}`} />
                {m.label}
              </Badge>
            );
          })}
          {hasSharedExpense && (
            <Badge
              variant="secondary"
              className="gap-1.5 rounded-lg px-2.5 py-1"
            >
              <Heart className="h-3.5 w-3.5 text-chart-4" />
              First shared
            </Badge>
          )}
          {earnedMilestones.length === 0 && !hasSharedExpense && (
            <span className="text-sm text-muted-foreground">
              Start logging expenses to earn milestones!
            </span>
          )}
        </div>
        {nextMilestone && (
          <p className="text-xs text-muted-foreground">
            {nextMilestone.threshold - totalExpenses} more to unlock{" "}
            <span className="font-medium text-foreground">
              {nextMilestone.label}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
