"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonthlyTrend } from "@/lib/finance";
import { formatCurrency, formatShortMonthLabel } from "@/lib/finance";

type Props = {
  data: MonthlyTrend[];
};

export function YearInReviewChart({ data }: Props) {
  if (data.length === 0) return null;

  const chartData = data
    .map((d) => ({
      month: formatShortMonthLabel(d.month),
      total: d.total,
      shared: d.sharedSpent,
      personal: d.personalSpent,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -20, bottom: 4 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(value) => formatCurrency(Number(value ?? 0))}
            contentStyle={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow:
                "0 12px 30px color-mix(in oklch, var(--foreground) 12%, transparent)",
            }}
            labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
            itemStyle={{ color: "var(--foreground)" }}
          />
          <Bar
            dataKey="total"
            fill="var(--primary)"
            radius={[6, 6, 0, 0]}
            barSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
