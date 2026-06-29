"use client";

import type { MonthlyTrend } from "@/lib/finance";

type Props = {
  trends: MonthlyTrend[];
};

export function SpendingTrendsSparkline({ trends }: Props) {
  if (trends.length < 2) return null;

  const values = trends.map((t) => t.total);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const width = 120;
  const height = 32;
  const padding = 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  const lastValue = values[values.length - 1];
  const prevValue = values[values.length - 2];
  const direction = lastValue >= prevValue ? "up" : "down";
  const change =
    prevValue > 0
      ? Math.round(((lastValue - prevValue) / prevValue) * 100)
      : 0;

  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-8 w-[7.5rem] overflow-visible"
        fill="none"
      >
        <defs>
          <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#sparkline-fill)" />
        <path
          d={pathD}
          stroke="var(--primary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={points[points.length - 1].x.toFixed(1)}
          cy={points[points.length - 1].y.toFixed(1)}
          r="2.5"
          fill="var(--primary)"
        />
      </svg>
      <span
        className={`text-xs font-medium tabular-nums ${
          direction === "up" ? "text-chart-4" : "text-chart-3"
        }`}
      >
        {direction === "up" ? "↑" : "↓"} {Math.abs(change)}%
      </span>
    </div>
  );
}
