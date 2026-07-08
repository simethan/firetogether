import Link from "next/link";

import { formatCurrency } from "@/lib/finance";

type Envelope = {
  categoryName: string;
  spent: number;
  funded: number;
  isShared: boolean;
  status: string;
};

function EnvelopeCard({
  label,
  spent,
  funded,
  isShared,
  emphasis = false,
}: {
  label: string;
  spent: number;
  funded: number;
  isShared?: boolean;
  emphasis?: boolean;
}) {
  const pct =
    funded > 0 ? Math.min(100, Math.round((spent / funded) * 100)) : 0;
  const over = spent > funded;

  return (
    <div
      className={`group relative w-44 shrink-0 snap-start overflow-hidden rounded-2xl border p-4 transition-shadow duration-300 hover:shadow-[0_8px_24px_-12px_rgba(35,30,24,0.45)] ${
        emphasis
          ? "border-ember/40 bg-ember/10"
          : "border-border bg-card"
      }`}
    >
      {/* Envelope flap — lifts a hair on hover */}
      <svg
        aria-hidden
        className="absolute inset-x-0 top-0 h-5 w-full text-taupe/50 transition-transform duration-300 group-hover:-translate-y-1"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
      >
        <path
          d="M0 0 L50 17 L100 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>

      <div className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-taupe">
        <span className="truncate">{label}</span>
        {isShared ? (
          <span className="rounded-sm bg-foreground/5 px-1 text-[9px] text-taupe">
            S
          </span>
        ) : null}
      </div>

      <div className="mt-2 font-heading text-2xl leading-none tabular-nums text-foreground">
        {formatCurrency(spent)}
      </div>
      <div className="mt-1 font-mono text-[11px] tabular-nums text-taupe">
        of {formatCurrency(funded)}
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className={`h-full rounded-full ${over ? "bg-clay" : "bg-sage"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function EnvelopeShelf({
  envelopes,
  readyToAssign,
}: {
  envelopes: Envelope[];
  readyToAssign: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-taupe">
          Envelopes
        </h2>
        <Link
          href="/budgets"
          className="font-mono text-[11px] text-ember hover:underline"
        >
          Manage →
        </Link>
      </div>

      <div className="scrollbar-none mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
        <EnvelopeCard
          label="Ready to assign"
          spent={Math.max(0, readyToAssign)}
          funded={Math.max(0, readyToAssign)}
          emphasis
        />
        {envelopes.map((env) => (
          <EnvelopeCard
            key={env.categoryName}
            label={env.categoryName}
            spent={env.spent}
            funded={env.funded}
            isShared={env.isShared}
          />
        ))}
      </div>
    </div>
  );
}
