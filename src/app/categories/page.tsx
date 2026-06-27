import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import type { Category } from "@/lib/types";
import { CategoryList, CreateCategoryForm } from "@/components/categories/category-list";

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

export default async function CategoriesPage({
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

  const { data: categories } = await admin
    .from("categories")
    .select("id, couple_id, name, icon, is_default, created_at")
    .eq("couple_id", currentUser.couple_id)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  const typedCategories = (categories ?? []) as Category[];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-lg shadow-orange-500/5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Badge variant="secondary" className="w-fit">Categories</Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Manage your couple&apos;s categories</h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Categories power expense entry, dashboard breakdowns, and monthly budgets.
          </p>
        </div>
      </div>

      <ErrorBanner searchParams={resolvedSearchParams} />

      <Card className="border-border/60 shadow-lg shadow-orange-500/5">
        <CardHeader>
          <CardTitle>Add a category</CardTitle>
          <CardDescription>Create a custom category for your couple.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCategoryForm />
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-lg shadow-orange-500/5">
        <CardHeader>
          <CardTitle>Your categories</CardTitle>
          <CardDescription>
            Hover over a category to edit or delete it. Default categories are created automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryList categories={typedCategories} />
        </CardContent>
      </Card>
    </div>
  );
}
