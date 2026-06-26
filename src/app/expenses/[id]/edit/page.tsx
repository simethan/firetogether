import { redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { ExpenseForm } from "@/components/expenses/expense-form";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id, email, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) {
    redirect("/onboarding");
  }

  const { data: expense } = await admin
    .from("expenses")
    .select("id, couple_id, user_id, category_id, amount, description, expense_date, split_type, custom_ratio, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!expense || expense.couple_id !== currentUser.couple_id) {
    redirect("/expenses");
  }

  const { data: categories } = await admin
    .from("categories")
    .select("id, couple_id, name, icon, is_default, created_at")
    .eq("couple_id", currentUser.couple_id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-3xl space-y-6">
        <Card className="border-border/60 shadow-lg shadow-orange-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-3xl font-bold">✏️ Edit expense</CardTitle>
            <CardDescription>
              Update or delete this expense from your couple workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Editing expense saved as{" "}
              <span className="font-medium text-foreground">{currentUser.name}</span>.
            </p>
            <Link
              href="/expenses"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              ← Back to expenses
            </Link>
          </CardContent>
        </Card>

        <ExpenseForm categories={categories ?? []} expense={expense} />
      </div>
    </div>
  );
}
