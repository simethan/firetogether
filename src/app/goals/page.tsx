import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { formatCurrency, getGoalProgress } from "@/lib/finance";
import type { SavingsGoal } from "@/lib/types";
import {
  addFundsAction,
  createGoalAction,
  deleteGoalAction,
  updateGoalAction,
} from "./actions";

function ErrorBanner({ searchParams }: { searchParams: { error?: string } }) {
  if (!searchParams.error) {
    return null;
  }

  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {decodeURIComponent(searchParams.error)}
    </div>
  );
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) {
    redirect("/onboarding");
  }

  const { data: goals } = await admin
    .from("savings_goals")
    .select(
      "id, couple_id, created_by, name, target_amount, current_amount, deadline, is_shared, icon, created_at",
    )
    .eq("couple_id", currentUser.couple_id)
    .order("created_at", { ascending: false });

  const typedGoals = (goals ?? []) as SavingsGoal[];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Badge variant="secondary" className="w-fit">
            Savings goals
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Plan the next shared milestone
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Track your couple&apos;s goals, edit targets and deadlines, and
            update progress directly as plans change.
          </p>
        </div>
      </div>

      <ErrorBanner searchParams={resolvedSearchParams} />

      <Card>
        <CardHeader>
          <CardTitle>Create goal</CardTitle>
          <CardDescription>
            Add a new savings goal for a shared trip, home project, or
            milestone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createGoalAction} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Goal name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Weekend getaway"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_amount">Target amount</Label>
              <Input
                id="target_amount"
                name="target_amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="2000"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="current_amount">Saved so far</Label>
              <Input
                id="current_amount"
                name="current_amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="250"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input id="deadline" name="deadline" type="date" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Input id="icon" name="icon" placeholder="Plane, Home, Car..." />
            </div>

            <div className="flex items-center gap-2 pt-8">
              <input
                id="is_shared"
                name="is_shared"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="is_shared">Shared goal</Label>
            </div>

            <div className="md:col-span-2">
              <Button type="submit">Save goal</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {typedGoals.length > 0 ? (
          typedGoals.map((goal, index) => {
            const progress = getGoalProgress(goal);

            const currentAmount = Number(goal.current_amount);
            const targetAmount = Number(goal.target_amount);
            const remaining = Math.max(0, targetAmount - currentAmount);

            return (
              <Card
                key={goal.id}
                className="overflow-hidden"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                        {goal.icon || "🎯"}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-2xl">
                          {goal.name}
                        </CardTitle>
                        <CardDescription>
                          {goal.is_shared ? "Shared goal" : "Personal goal"}
                          {goal.deadline ? ` • Due ${goal.deadline}` : ""}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={progress >= 100 ? "secondary" : "outline"}>
                      {progress}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium text-foreground">
                        {formatCurrency(currentAmount)} /{" "}
                        {formatCurrency(targetAmount)}
                      </span>
                    </div>
                    <Progress value={progress} />
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-xl border border-border bg-background/60 p-3">
                        <div className="text-muted-foreground">Saved</div>
                        <div className="font-semibold tabular-nums">
                          {formatCurrency(currentAmount)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-background/60 p-3">
                        <div className="text-muted-foreground">Remaining</div>
                        <div className="font-semibold tabular-nums">
                          {formatCurrency(remaining)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-background/60 p-3">
                        <div className="text-muted-foreground">Target</div>
                        <div className="font-semibold tabular-nums">
                          {formatCurrency(targetAmount)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <form
                    action={updateGoalAction}
                    className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-2"
                  >
                    <div className="md:col-span-2">
                      <h3 className="font-semibold text-foreground">
                        Edit goal and progress
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Adjust details or set the saved amount directly.
                      </p>
                    </div>
                    <input type="hidden" name="id" value={goal.id} />
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor={`name-${goal.id}`}>Name</Label>
                      <Input
                        id={`name-${goal.id}`}
                        name="name"
                        defaultValue={goal.name}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`target_amount-${goal.id}`}>
                        Target amount
                      </Label>
                      <Input
                        id={`target_amount-${goal.id}`}
                        name="target_amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={targetAmount}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`current_amount-${goal.id}`}>
                        Saved so far
                      </Label>
                      <Input
                        id={`current_amount-${goal.id}`}
                        name="current_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={currentAmount}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`deadline-${goal.id}`}>Deadline</Label>
                      <Input
                        id={`deadline-${goal.id}`}
                        name="deadline"
                        type="date"
                        defaultValue={goal.deadline ?? ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`icon-${goal.id}`}>Icon</Label>
                      <Input
                        id={`icon-${goal.id}`}
                        name="icon"
                        defaultValue={goal.icon ?? ""}
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-8">
                      <input
                        id={`is_shared-${goal.id}`}
                        name="is_shared"
                        type="checkbox"
                        defaultChecked={goal.is_shared}
                        className="h-4 w-4 rounded border-border"
                      />
                      <Label htmlFor={`is_shared-${goal.id}`}>Shared</Label>
                    </div>
                    <div className="md:col-span-2">
                      <Button type="submit" variant="outline">
                        Save goal + progress
                      </Button>
                    </div>
                  </form>

                  <form
                    action={addFundsAction}
                    className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/20 p-4 sm:flex-row"
                  >
                    <div className="flex-1">
                      <Label
                        htmlFor={`add-funds-${goal.id}`}
                        className="sr-only"
                      >
                        Add funds
                      </Label>
                      <input type="hidden" name="id" value={goal.id} />
                      <Input
                        id={`add-funds-${goal.id}`}
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Add a contribution"
                      />
                    </div>
                    <Button type="submit">Add funds</Button>
                  </form>

                  <form action={deleteGoalAction}>
                    <input type="hidden" name="id" value={goal.id} />
                    <Button type="submit" variant="destructive">
                      Delete goal
                    </Button>
                  </form>
                </CardContent>

                {index < typedGoals.length - 1 ? <Separator /> : null}
              </Card>
            );
          })
        ) : (
          <Card className="xl:col-span-2">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No savings goals yet. Create the first one above.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
