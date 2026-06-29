"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { CategoryIcon } from "@/components/categories/category-icon";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

type Props = {
  categories: Category[];
  selectedId: string | null;
};

export function CategoryFilter({ categories, selectedId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setFilter = useCallback(
    (categoryId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (categoryId) {
        next.set("category", categoryId);
      } else {
        next.delete("category");
      }
      router.push(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="relative">
      {/* Fade edge hint for scrollability */}
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-linear-to-r from-transparent to-card" />

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setFilter(null)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
            !selectedId
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          All
        </button>

        {categories.map((cat) => {
          const isActive = selectedId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setFilter(isActive ? null : cat.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                <CategoryIcon icon={cat.icon} fallback="💸" />
              </span>
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
