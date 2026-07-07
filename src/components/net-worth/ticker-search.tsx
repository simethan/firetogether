"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCallback, useRef, useState } from "react";

type Quote = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
};

type Props = {
  value: string;
  onChange: (symbol: string, name: string, exchange: string) => void;
};

export function TickerSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Quote[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/net-worth/search-stocks?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setOpen(data.results?.length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (q: string) => {
    setQuery(q);
    setSelectedLabel("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => doSearch(q), 250);
  };

  const select = (quote: Quote) => {
    setSelectedLabel(`${quote.symbol} — ${quote.name}`);
    setQuery(quote.symbol);
    setOpen(false);
    onChange(quote.symbol, quote.name, quote.exchange);
  };

  return (
    <div className="relative">
      <Input
        placeholder="Search ticker (e.g. VWRA, CSPX, D05.SI)"
        value={selectedLabel || query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card p-1 shadow-lg">
          {results.map((quote) => (
            <button
              key={quote.symbol}
              type="button"
              onMouseDown={() => select(quote)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                query === quote.symbol && "bg-muted",
              )}
            >
              <span className="font-medium tabular-nums text-foreground">
                {quote.symbol}
              </span>
              <span className="flex-1 truncate text-muted-foreground">
                {quote.name}
              </span>
              {quote.exchange && (
                <span className="text-[11px] uppercase text-muted-foreground/60">
                  {quote.exchange}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
