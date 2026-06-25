"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CategorySummary } from "@/lib/finance";
import { formatCurrency } from "@/lib/finance";

const chartColors = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type Props = {
  data: CategorySummary[];
};

export function DashboardCharts({ data }: Props) {
  const chartData = data
    .filter((item) => item.amount > 0)
    .slice(0, 6)
    .map((item) => ({
      ...item,
      label: item.name.length > 18 ? `${item.name.slice(0, 16)}…` : item.name,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <span className="text-4xl">📊</span>
        <div>
          <p className="font-medium text-foreground">
            No spending to chart yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add an expense and it will appear here, even without a category.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 18, left: 8, bottom: 4 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={118}
            tick={{ fontSize: 12, fill: "var(--foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(value) => formatCurrency(Number(value ?? 0))}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.name ?? "Category"
            }
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
          <Bar dataKey="amount" radius={[0, 10, 10, 0]} barSize={22}>
            {chartData.map((entry, index) => (
              <Cell
                key={entry.categoryId ?? entry.name}
                fill={
                  entry.categoryId
                    ? chartColors[index % chartColors.length]
                    : "var(--muted-foreground)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
