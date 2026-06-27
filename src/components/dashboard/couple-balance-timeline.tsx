"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BalancePoint } from "@/lib/finance";
import { formatCurrency } from "@/lib/finance";

type Props = {
  data: BalancePoint[];
};

export function CoupleBalanceTimeline({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <span className="text-4xl">⚖️</span>
        <div>
          <p className="font-medium text-foreground">No balance data yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add expenses over multiple months to see the balance timeline.
          </p>
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    month: d.label,
    [d.paidBy.name]: d.paidBy.amount,
    [d.paidByPartner.name]: d.paidByPartner.amount,
    netBalance: d.netBalance,
  }));

  const userAName = data[0].paidBy.name;
  const userBName = data[0].paidByPartner.name;

  return (
    <div className="space-y-4">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
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
              tickFormatter={(v) => `$${v}`}
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
                borderRadius: 12,
                boxShadow:
                  "0 8px 24px color-mix(in oklch, var(--foreground) 10%, transparent)",
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
              itemStyle={{ color: "var(--foreground)" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Bar
              dataKey={userAName}
              fill="var(--primary)"
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
            <Bar
              dataKey={userBName}
              fill="var(--chart-2)"
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Net balance line */}
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 8, left: -20, bottom: 4 }}
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
              tickFormatter={(v) =>
                v === 0 ? "$0" : v > 0 ? `+${formatCurrency(v)}` : `−${formatCurrency(Math.abs(v))}`
              }
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) => {
                const v = Number(value ?? 0);
                return v === 0
                  ? "$0 — even"
                  : v > 0
                    ? `${formatCurrency(v)} (${userAName} paid more)`
                    : `${formatCurrency(Math.abs(v))} (${userBName} paid more)`;
              }}
              contentStyle={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow:
                  "0 8px 24px color-mix(in oklch, var(--foreground) 10%, transparent)",
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
              itemStyle={{ color: "var(--foreground)" }}
            />
            <Line
              type="monotone"
              dataKey="netBalance"
              stroke="var(--chart-3)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--chart-3)" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
