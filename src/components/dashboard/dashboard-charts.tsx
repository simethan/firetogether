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

import type { CategorySummary } from "@/lib/finance";
import { formatCurrency } from "@/lib/finance";

type Props = {
  data: CategorySummary[];
};

export function DashboardCharts({ data }: Props) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tickFormatter={(value) => `$${value}`} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value ?? 0))}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            contentStyle={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
            }}
          />
          <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}