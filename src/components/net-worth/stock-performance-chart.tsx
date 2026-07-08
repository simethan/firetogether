"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* ─── Range presets ──────────────────────────────────────────── */

type RangeKey = "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "5Y", label: "5Y" },
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
    case "1W":
      start.setDate(start.getDate() - 7);
      break;
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
    case "5Y":
      start.setFullYear(start.getFullYear() - 5);
      break;
  }

  // Compare ISO date strings (yyyy-mm-dd) directly — lexicographic order
  // matches chronological order and avoids UTC/local-edge bugs.
  const startStr = start.toISOString().slice(0, 10);
  return data.filter((d) => d.date >= startStr);
}

/* ─── Helpers ─────────────────────────────────────────────────── */

/** Format a dollar value as a full-precision raw number (no K/M). */
function formatRaw(v: number) {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Short label for axis ticks — still use K/M here since space is tight. */
function formatAxisValue(v: number) {
  if (Math.abs(v) >= 1_000_000) return `S$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `S$${(v / 1_000).toFixed(0)}K`;
  return `S$${v.toFixed(0)}`;
}

function formatDateLabel(dateStr: string, range: RangeKey) {
  const d = new Date(dateStr);
  if (range === "1W") {
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  }
  if (range === "1M" || range === "3M" || range === "6M") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/* ─── Custom tooltip ──────────────────────────────────────────── */

function ChartTooltip({
  active,
  payload,
  label,
  costBasis,
  timeReturnPct,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  costBasis: number;
  timeReturnPct: number;
}) {
  if (!active || !payload?.length || !label) return null;
  const value = payload[0].value;
  const pnl = value - costBasis;
  const costPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  const isUp = pnl >= 0;

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
        S$&thinsp;{formatRaw(value)}
      </p>
      <div className="mt-1 flex flex-col gap-0.5 text-[11px] tabular-nums">
        <span className={isUp ? "text-emerald-500" : "text-destructive"}>
          From cost: {isUp ? "+" : ""}S$&thinsp;{formatRaw(pnl)} ({isUp ? "+" : ""}
          {costPct.toFixed(1)}%)
        </span>
        <span className={timeReturnPct >= 0 ? "text-emerald-500" : "text-destructive"}>
          In period: {timeReturnPct >= 0 ? "+" : ""}{timeReturnPct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/* ─── Ticker badge ────────────────────────────────────────────── */

function TickerBadge({
  ticker,
  valueInSgd,
  pnl,
  pnlPercent,
}: {
  ticker: string;
  valueInSgd: number;
  pnl: number;
  pnlPercent: number;
}) {
  const isUp = pnl >= 0;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-2.5 py-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
        {ticker}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        S$&thinsp;{formatRaw(valueInSgd)}
      </span>
      <span
        className={`text-[11px] tabular-nums ${
          isUp ? "text-emerald-500" : "text-destructive"
        }`}
      >
        {isUp ? "+" : ""}
        {pnl.toLocaleString("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
        &nbsp;({isUp ? "+" : ""}
        {pnlPercent.toFixed(1)}%)
      </span>
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────── */

export function StockPerformanceChart({
  history,
  costBasis,
  dividendTotal,
  tickers,
}: {
  history: { date: string; total: number }[];
  costBasis: number;
  dividendTotal?: number;
  tickers: {
    ticker: string;
    valueInSgd: number;
    pnl: number;
    pnlPercent: number;
  }[];
}) {
  const [range, setRange] = useState<RangeKey>("1Y");

  const sliced = useMemo(() => sliceByRange(history, range), [history, range]);

  // Current value = last point in sliced data (or 0)
  const currentValue = sliced.length > 0 ? sliced[sliced.length - 1].total : 0;
  const firstValue = sliced.length > 0 ? sliced[0].total : 0;
  const pnl = currentValue - costBasis;
  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  const timeReturnPct = firstValue > 0 ? ((currentValue - firstValue) / firstValue) * 100 : 0;
  const isUp = pnl >= 0;

  // Y-axis ticks
  const yTicks = useMemo(() => {
    if (sliced.length === 0) return [];
    const values = sliced.map((d) => d.total);
    const allVals = [...values, costBasis];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const pad = (max - min) * 0.12 || max * 0.05;
    const lo = min - pad;
    const hi = max + pad;
    const step = Math.max(1, Math.round((hi - lo) / 4 / 1000) * 1000);
    const ticks: number[] = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
      ticks.push(t);
    }
    return ticks;
  }, [sliced, costBasis]);

  if (history.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-border/50 text-xs text-muted-foreground">
        Backfill stock data to see your portfolio&rsquo;s performance over time.
      </div>
    );
  }

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

  return (
    <div className="space-y-4">
      {/* Header row: value + cost basis + returns */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Stock portfolio
          </p>
          <p className="mt-px text-3xl font-semibold tabular-nums tracking-tight text-foreground sm:text-4xl">
            S$&thinsp;{formatRaw(currentValue)}
          </p>
        </div>

        {/* Cost basis + returns panel */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-border/40 bg-muted/20 px-3.5 py-2">
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Cost
            </p>
            <p className="text-sm tabular-nums text-foreground">
              S$&thinsp;{formatRaw(costBasis)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              vs cost
            </p>
            <p
              className={`text-sm tabular-nums ${
                isUp ? "text-emerald-500" : "text-destructive"
              }`}
            >
              {isUp ? "▲" : "▼"}&nbsp;{isUp ? "+" : ""}
              {pnlPct.toFixed(1)}%
            </p>
            <p className="text-[10px] tabular-nums text-muted-foreground">
              {pnl >= 0 ? "+" : ""}S$&thinsp;{formatRaw(pnl)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              vs period start
            </p>
            <p
              className={`text-sm tabular-nums ${
                timeReturnPct >= 0 ? "text-emerald-500" : "text-destructive"
              }`}
            >
              {timeReturnPct >= 0 ? "▲" : "▼"}&nbsp;
              {timeReturnPct >= 0 ? "+" : ""}
              {timeReturnPct.toFixed(1)}%
            </p>
            <p className="text-[10px] tabular-nums text-muted-foreground">
              {timeReturnPct >= 0 ? "+" : ""}S$&thinsp;
              {formatRaw(currentValue - firstValue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Dividends
            </p>
            <p className="text-sm tabular-nums text-sage">
              S$&thinsp;{formatRaw(dividendTotal ?? 0)}
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
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sliced} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="stockAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="hsl(var(--border))"
              strokeOpacity={0.35}
              vertical={false}
            />
            {/* Cost basis reference line */}
            {costBasis > 0 && sliced.length > 0 && (
              <ReferenceLine
                y={costBasis}
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.35}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: "Cost basis",
                  position: "insideTopLeft",
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 10,
                  fontWeight: 500,
                }}
              />
            )}
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
              ticks={yTicks}
              domain={([min, max]) => {
                const allMin = Math.min(min, costBasis);
                const allMax = Math.max(max, costBasis);
                const pad = (allMax - allMin) * 0.12 || allMax * 0.05;
                return [allMin - pad, allMax + pad];
              }}
            />
            <Tooltip content={<ChartTooltip costBasis={costBasis} timeReturnPct={timeReturnPct} />} />
            <Area
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#stockAreaFill)"
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
            Return:{" "}
            <span
              className={`font-medium tabular-nums ${
                timeReturnPct >= 0 ? "text-emerald-500" : "text-destructive"
              }`}
            >
              {timeReturnPct >= 0 ? "+" : ""}
              {timeReturnPct.toFixed(1)}%
            </span>
          </span>
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{sliced.length}</span> trading days
          </span>
        </div>
      )}

      {/* Per-ticker breakdown */}
      {tickers.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {tickers.map((t) => (
            <TickerBadge key={t.ticker} {...t} />
          ))}
        </div>
      )}
    </div>
  );
}
