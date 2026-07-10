"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/finance";

/* ─── Range presets ──────────────────────────────────────────── */

type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "ALL", label: "All" },
];

function sliceByRange(
  data: { date: string; total: number }[],
  range: RangeKey,
) {
  if (data.length === 0) return [];
  if (range === "ALL") return data;

  const now = new Date();
  const start = new Date(now);
  switch (range) {
    case "1M":
      start.setMonth(start.getMonth() - 1);
      break;
    case "3M":
      start.setMonth(start.getMonth() - 3);
      break;
    case "6M":
      start.setMonth(start.getMonth() - 6);
      break;
    case "YTD":
      start.setMonth(0);
      start.setDate(1);
      break;
    case "1Y":
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  const startStr = start.toISOString().slice(0, 10);
  return data.filter((d) => d.date >= startStr);
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function formatAxisValue(v: number) {
  if (Math.abs(v) >= 1_000_000) return `S$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `S$${(v / 1_000).toFixed(0)}K`;
  return `S$${v.toFixed(0)}`;
}

function formatDateLabel(dateStr: string, range: RangeKey) {
  const d = new Date(dateStr);
  if (range === "1M") {
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/* ─── Custom tooltip ──────────────────────────────────────────── */

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-lg">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {new Date(label).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────── */

export function NetWorthHistoryChart({
  history,
}: {
  history: { date: string; total: number }[];
}) {
  const [range, setRange] = useState<RangeKey>("ALL");

  const sliced = useMemo(() => sliceByRange(history, range), [history, range]);

  const currentValue = sliced.length > 0 ? sliced[sliced.length - 1].total : 0;
  const firstValue = sliced.length > 0 ? sliced[0].total : 0;
  const growth = currentValue - firstValue;
  const growthPct = firstValue > 0 ? (growth / firstValue) * 100 : 0;
  const isUp = growth >= 0;

  const xTickCount = sliced.length > 60 ? 8 : sliced.length > 30 ? 6 : 4;

  const xTicks = useMemo(() => {
    if (sliced.length <= xTickCount) return sliced.map((d) => d.date);
    const step = Math.floor(sliced.length / (xTickCount - 1));
    const ticks: string[] = [];
    for (let i = 0; i < sliced.length; i += step) {
      ticks.push(sliced[i].date);
    }
    if (ticks[ticks.length - 1] !== sliced[sliced.length - 1].date) {
      ticks.push(sliced[sliced.length - 1].date);
    }
    return ticks;
  }, [sliced, xTickCount]);

  if (history.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border/50 px-4 text-center text-xs text-muted-foreground">
        No history yet. Snapshots are taken automatically when you visit — or
        hit “Take snapshot” to start tracking your net worth over time.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: current total + growth */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Net worth
          </p>
          <p className="mt-px text-3xl font-semibold tabular-nums tracking-tight text-foreground sm:text-4xl">
            {formatCurrency(currentValue)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-border/40 bg-muted/20 px-3.5 py-2">
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Since {range === "ALL" ? "start" : range}
            </p>
            <p
              className={`text-sm tabular-nums ${
                isUp ? "text-emerald-500" : "text-destructive"
              }`}
            >
              {isUp ? "▲" : "▼"}&nbsp;{isUp ? "+" : ""}
              {formatCurrency(growth)} ({isUp ? "+" : ""}
              {growthPct.toFixed(1)}%)
            </p>
          </div>
        </div>
      </div>

      {/* Range selector */}
      <div className="flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-colors ${
              range === r.key
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-60 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sliced} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="nwAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.20" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="hsl(var(--border))"
              strokeOpacity={0.35}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              ticks={xTicks}
              tickFormatter={(d: string) => formatDateLabel(d, range)}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 400 }}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            <YAxis
              tickFormatter={formatAxisValue}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 400 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#nwAreaFill)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "hsl(var(--primary))",
                stroke: "hsl(var(--card))",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary bar */}
      {sliced.length >= 2 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
          <span className="text-muted-foreground">
            {new Date(sliced[0].date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            &thinsp;–&thinsp;
            {new Date(sliced[sliced.length - 1].date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{sliced.length}</span> data
            points
          </span>
        </div>
      )}
    </div>
  );
}
