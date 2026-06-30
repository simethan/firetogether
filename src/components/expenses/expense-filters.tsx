"use client";

import { useCallback, useRef, useState, useEffect } from "react";

import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

type SplitCounts = {
  shared: number;
  custom: number;
  personal: number;
};

type Props = {
  categories: Category[];
  selectedCategoryId: string | null;
  query: string;
  splitType: string;
  splitCounts?: SplitCounts;
  onSearchChange: (value: string) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onSplitChange: (splitType: string | null) => void;
};

const SPLIT_CHIPS = [
  {
    value: "",
    label: "All",
    color: "neutral",
    inactiveDot: "bg-muted-foreground/40",
    activeBg: "bg-foreground",
    activeText: "text-background",
    hoverBorder: "hover:border-foreground/30",
  },
  {
    value: "shared",
    label: "Shared",
    color: "emerald",
    inactiveDot: "bg-emerald-500",
    activeBg: "bg-emerald-600",
    activeText: "text-white",
    hoverBorder: "hover:border-emerald-300",
  },
  {
    value: "custom",
    label: "Custom",
    color: "amber",
    inactiveDot: "bg-amber-500",
    activeBg: "bg-amber-600",
    activeText: "text-white",
    hoverBorder: "hover:border-amber-300",
  },
  {
    value: "personal",
    label: "Personal",
    color: "violet",
    inactiveDot: "bg-violet-500",
    activeBg: "bg-violet-600",
    activeText: "text-white",
    hoverBorder: "hover:border-violet-300",
  },
] as const;

export function ExpenseFilters({
  categories,
  selectedCategoryId,
  query,
  splitType,
  splitCounts,
  onSearchChange,
  onCategoryChange,
  onSplitChange,
}: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchValue, setSearchValue] = useState(query);

  // Sync local state when query changes externally (e.g. clear from parent)
  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchValue(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onSearchChange(value);
      }, 250);
    },
    [onSearchChange],
  );

  const handleClear = useCallback(() => {
    setSearchValue("");
    onSearchChange("");
  }, [onSearchChange]);

  const isActive = (value: string) =>
    splitType === value || (!splitType && value === "");

  return (
    <div className="rounded-2xl border border-border bg-card">
      {/* Tier 1: Search + Category — search dominates, category is compact */}
      <div className="flex flex-col gap-2 border-b border-border/50 p-3 sm:flex-row sm:items-center sm:gap-2 sm:p-3">
        <div className="relative flex-1 min-w-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={searchValue}
            onChange={handleSearchChange}
            placeholder="Search descriptions…"
            className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-8 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-[3px] focus:ring-primary/20"
          />
          {searchValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </div>

        <select
          value={selectedCategoryId ?? ""}
          onChange={(e) => onCategoryChange(e.target.value || null)}
          className="h-10 shrink-0 rounded-xl border border-input bg-background px-2.5 text-sm outline-none transition-all focus:border-primary/40 focus:ring-[3px] focus:ring-primary/20 sm:max-w-36"
        >
          <option value="">Category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tier 2: Split-type chips with live counts */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-3 sm:px-4">
        <span className="me-2 text-[11px] font-medium text-muted-foreground/70">
          By type
        </span>
        {SPLIT_CHIPS.map((chip) => {
          const active = isActive(chip.value);
          const count =
            chip.value === ""
              ? null
              : splitCounts?.[chip.value as keyof SplitCounts];

          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onSplitChange(chip.value || null)}
              className={cn(
                "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition-all active:scale-[0.96]",
                active
                  ? `${chip.activeBg} ${chip.activeText} border-transparent shadow-xs`
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60",
              )}
            >
              {chip.value && (
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    active ? "bg-white/80" : chip.inactiveDot,
                  )}
                />
              )}
              {chip.label}
              {count !== null && (
                <span
                  className={cn(
                    "ml-0.5 tabular-nums",
                    active
                      ? "text-white/70"
                      : "text-muted-foreground/60",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {/* Active filter summary */}
        {(query || selectedCategoryId) && (
          <span className="ml-auto hidden text-[11px] text-muted-foreground/50 sm:inline">
            {[query ? `"${query}"` : null, selectedCategoryId ? "categorized" : null]
              .filter(Boolean)
              .join(" + ")}
          </span>
        )}
      </div>
    </div>
  );
}
