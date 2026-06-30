"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getCurrentMonthValue,
  getMonthOffset,
  formatMonthLabel,
} from "@/lib/finance";

type Props = {
  currentMonth: string;
  basePath?: string;
};

export function MonthSelector({ currentMonth, basePath = "/dashboard" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedMonth =
    searchParams.get("month") || getCurrentMonthValue();

  const prevMonth = getMonthOffset(1, selectedMonth);
  const nextMonth = getMonthOffset(-1, selectedMonth);
  const isCurrentMonth = selectedMonth === currentMonth;
  const isFutureMonth = selectedMonth > currentMonth;

  function navigate(month: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (month === currentMonth) {
      params.delete("month");
    } else {
      params.set("month", month);
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-xl"
        onClick={() => navigate(prevMonth)}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[10rem] text-center text-sm font-medium text-foreground">
        {formatMonthLabel(selectedMonth)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-xl"
        onClick={() => navigate(nextMonth)}
        disabled={isCurrentMonth || isFutureMonth}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
