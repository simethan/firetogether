import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import type { Category } from "@/lib/types";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "./actions";

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
          <CardTitle>Create category</CardTitle>
          <CardDescription>Add a custom category for your couple.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createCategoryAction} className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Date nights" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Input id="icon" name="icon" placeholder="Heart, Car, Plane..." />
            </div>
            <div className="md:col-span-3">
              <Button type="submit">Save category</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-lg shadow-orange-500/5">
        <CardHeader>
          <CardTitle>Current categories</CardTitle>
          <CardDescription>Default categories are created automatically when a couple is created.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {typedCategories.length > 0 ? (
            typedCategories.map((category, index) => (
              <div key={category.id}>
                <div className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <form action={updateCategoryAction} className="grid gap-3 md:grid-cols-3">
                    <input type="hidden" name="id" value={category.id} />
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor={`name-${category.id}`}>Name</Label>
                      <Input id={`name-${category.id}`} name="name" defaultValue={category.name} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`icon-${category.id}`}>Icon</Label>
                      <Input id={`icon-${category.id}`} name="icon" defaultValue={category.icon ?? ""} />
                    </div>
                    <div className="md:col-span-3 flex flex-wrap gap-2">
                      <Button type="submit" variant="outline">Save</Button>
                      <Badge variant={category.is_default ? "secondary" : "outline"}>
                        {category.is_default ? "Default" : "Custom"}
                      </Badge>
                    </div>
                  </form>

                  <form action={deleteCategoryAction}>
                    <input type="hidden" name="id" value={category.id} />
                    <Button type="submit" variant="destructive">Delete</Button>
                  </form>
                </div>

                {index < typedCategories.length - 1 ? <Separator className="my-4" /> : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No categories found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
