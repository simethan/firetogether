import { redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { ExpenseForm } from "@/components/expenses/expense-form";

export default async function NewExpensePage() {
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
            <CardTitle className="text-3xl">Add an expense</CardTitle>
            <CardDescription>
              Quick entry for the iOS Shortcut and the main app flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Saved as {currentUser.name} for your couple workspace.</p>
            <Link
              href="/shortcut"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Open iPhone shortcut setup
            </Link>
          </CardContent>
        </Card>

        <ExpenseForm categories={categories ?? []} />
      </div>
    </div>
  );
}