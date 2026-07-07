import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StockPerformanceChart } from "@/components/net-worth/stock-performance-chart";
import { BackfillDialog } from "@/components/net-worth/backfill-dialog";
import { AddAccountForm } from "@/components/net-worth/add-account-form";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAuthUserId } from "@/lib/auth";
import { toSgd, formatWithCurrency } from "@/lib/fx";
import { fetchExchangeRates } from "@/lib/fx-rates";
import {
  computeNetWorthTotal,
  computeStockPnL,
  computeStockValue,
  computeStockCost,
  computeStockHistory,
  computeCategoryTotal,
  computeManagedPnL,
  formatCurrency,
  formatNetWorth,
  getAccountsByCategory,
} from "@/lib/finance";
import type {
  AccountBalanceSnapshot,
  Dividend,
  NetWorthAccount,
} from "@/lib/types";
import {
  createAccountAction,
  deleteAccountAction,
  deleteBalanceAction,
  deleteDividendAction,
  recordBalanceAction,
  recordDividendAction,
  refreshStockPricesAction,
  bulkBackfillAction,
} from "./actions";

/* ─── Helpers ─────────────────────────────────────────────────── */

function ErrorBanner({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {decodeURIComponent(error)}
    </div>
  );
}

function TrendArrow({ value }: { value: number }) {
  if (value > 0) return <span className="text-emerald-500">↑</span>;
  if (value < 0) return <span className="text-destructive">↓</span>;
  return null;
}

/** Compose a short human label for an account's metadata line. */
function accountMetaLine(account: NetWorthAccount): string {
  const parts: string[] = [];
  if (account.account_category === "bank" && account.bank_name) {
    parts.push(account.bank_name);
  }
  if (account.account_category === "investment") {
    if (account.broker) parts.push(account.broker);
    if (account.ticker) parts.push(account.ticker);
    if (account.exchange) parts.push(account.exchange);
  }
  if (account.account_category === "managed" && account.broker) {
    parts.push(account.broker);
  }
  if (account.currency && account.currency !== "SGD") {
    parts.push(account.currency);
  }
  return parts.join(" · ");
}

/* ─── Sections ─────────────────────────────────────────────────── */

async function fetchData(coupleId: string) {
  const admin = createServiceClient();
  const accountsRes = await admin
    .from("net_worth_accounts")
    .select("*")
    .eq("couple_id", coupleId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const accounts = (accountsRes.data ?? []) as NetWorthAccount[];
  const accountIds = accounts.map((a) => a.id);

  const [snapshotsRes, dividendsRes] = await Promise.all([
    admin
      .from("account_balance_history")
      .select("*")
      .in("account_id", accountIds)
      .order("recorded_at", { ascending: false })
      .limit(500),
    admin
      .from("dividends")
      .select("*")
      .in("account_id", accountIds)
      .order("pay_date", { ascending: false })
      .limit(200),
  ]);

  return {
    accounts,
    snapshots: (snapshotsRes.data ?? []) as AccountBalanceSnapshot[],
    dividends: (dividendsRes.data ?? []) as Dividend[],
  };
}

/* ─── Composition strip (stacked bar + legend) ────────────────── */

type CompositionLegendProps = {
  total: number;
  bankTotal: number;
  stockTotal: number;
  managedTotal: number;
};

const CATEGORY_STYLES = [
  { label: "Stocks", color: "bg-chart-1", bar: "bg-chart-1" },
  { label: "Cash", color: "bg-chart-2", bar: "bg-chart-2" },
  { label: "Managed", color: "bg-chart-3", bar: "bg-chart-3" },
] as const;

function CompositionBar({ total, bankTotal, stockTotal, managedTotal }: CompositionLegendProps) {
  if (total === 0) return null;
  const items = [stockTotal, bankTotal, managedTotal];
  const pcts = items.map((v) => (v / total) * 100);

  return (
    <div className="mt-5 space-y-2">
      {/* Proportional stacked bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
        {pcts.map((pct, i) =>
          pct > 0 ? (
            <div
              key={CATEGORY_STYLES[i].label}
              className={CATEGORY_STYLES[i].bar}
              style={{ width: `${pct}%` }}
            />
          ) : null,
        )}
      </div>
      {/* Legend row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {CATEGORY_STYLES.map((style, i) => {
          const value = [stockTotal, bankTotal, managedTotal][i];
          if (value <= 0) return null;
          return (
            <span key={style.label} className="inline-flex items-center gap-1.5 text-xs">
              <span className={`inline-block size-1.5 rounded-full ${style.color}`} />
              <span className="text-muted-foreground">{style.label}</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatCurrency(value)}
              </span>
              <span className="text-muted-foreground/50">
                {pcts[i].toFixed(0)}%
              </span>
            </span>
          );
        })}
        <span className="text-[10px] text-muted-foreground/40">in SGD</span>
      </div>
    </div>
  );
}

/* ─── Account card ─────────────────────────────────────────────── */

function AccountCard({
  account,
  currentValue,
  pnlLabel,
  pnlPositive,
  managedPnl,
  fxRates,
}: {
  account: NetWorthAccount;
  currentValue: number | null;
  pnlLabel: string | null;
  pnlPositive: boolean;
  managedPnl: { pnl: number; pnlPercent: number } | null;
  fxRates?: Map<string, number>;
}) {
  const isForeign = account.currency && account.currency !== "SGD";
  const isStock = account.account_category === "investment";
  const isManaged = account.account_category === "managed";
  const isBank = account.account_category === "bank";
  const accentColor = isStock
    ? "bg-chart-1"
    : isManaged
      ? "bg-chart-3"
      : "bg-chart-2";

  const sgdValue =
    currentValue !== null && isForeign
      ? toSgd(currentValue, account.currency, fxRates ?? new Map())
      : currentValue;

  return (
    <Card key={account.id} className="relative overflow-hidden">
      {/* Colored left-edge accent */}
      <div className={`absolute left-0 top-0 h-full w-[3px] ${accentColor}`} />

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${
                isStock ? "bg-chart-1/10" : isManaged ? "bg-chart-3/10" : "bg-chart-2/10"
              }`}
            >
              {account.icon || (isStock ? "📈" : isManaged ? "🤖" : "🏦")}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{account.name}</CardTitle>
              <CardDescription className="text-xs">
                {accountMetaLine(account) || account.type}
              </CardDescription>
            </div>
          </div>
          {isForeign && (
            <span className="shrink-0 rounded-md border border-border/50 bg-muted/20 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
              {account.currency}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Primary value */}
        {sgdValue !== null && (
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {isManaged ? "Balance" : "Value"}
              {isForeign && " in SGD"}
            </div>
            <div className="text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(sgdValue)}
            </div>
            {isForeign && currentValue !== null && (
              <div className="text-[10px] tabular-nums text-muted-foreground/60">
                {formatWithCurrency(currentValue, account.currency!)}
              </div>
            )}
          </div>
        )}

        {/* Stock / Managed detail grid */}
        <div className="grid grid-cols-3 gap-1.5 text-xs">
          {isStock && (
            <>
              <div className="rounded-md bg-muted/30 p-1.5">
                <div className="text-muted-foreground/60">Qty</div>
                <div className="font-medium tabular-nums text-foreground">{account.quantity ?? "—"}</div>
              </div>
              <div className="rounded-md bg-muted/30 p-1.5">
                <div className="text-muted-foreground/60">Cost</div>
                <div className="font-medium tabular-nums text-foreground">
                  {account.buy_price
                    ? formatWithCurrency(Number(account.buy_price), account.currency!)
                    : "—"}
                </div>
              </div>
              <div className="rounded-md bg-muted/30 p-1.5">
                <div className="text-muted-foreground/60">Price</div>
                <div className="font-medium tabular-nums text-foreground">
                  {account.current_price
                    ? formatWithCurrency(Number(account.current_price), account.currency!)
                    : "—"}
                </div>
              </div>
              <div className="col-span-3 rounded-md bg-muted/30 p-1.5">
                <div className="text-muted-foreground/60">P&amp;L (SGD)</div>
                <div className={`font-medium tabular-nums ${pnlPositive ? "text-emerald-500" : "text-destructive"}`}>
                  {pnlLabel || "—"}
                </div>
              </div>
            </>
          )}
          {managedPnl && (
            <>
              <div className="rounded-md bg-muted/30 p-1.5">
                <div className="text-muted-foreground/60">Invested</div>
                <div className="font-medium tabular-nums text-foreground">
                  {formatCurrency(account.initial_investment!)}
                </div>
              </div>
              <div className="rounded-md bg-muted/30 p-1.5">
                <div className="text-muted-foreground/60">Return</div>
                <div className={`font-medium tabular-nums ${managedPnl.pnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {managedPnl.pnl >= 0 ? "+" : ""}{formatCurrency(managedPnl.pnl)}
                </div>
              </div>
              <div className="rounded-md bg-muted/30 p-1.5">
                <div className="text-muted-foreground/60">Return %</div>
                <div className={`font-medium tabular-nums ${managedPnl.pnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {managedPnl.pnlPercent.toFixed(1)}%
                </div>
              </div>
            </>
          )}
        </div>

        {/* Inline record-actions */}
        <div className="flex flex-col gap-1.5 pt-1">
          {(isBank || isManaged) && (
            <form action={recordBalanceAction} className="flex gap-1.5">
              <input type="hidden" name="account_id" value={account.id} />
              <input
                type="date"
                name="recorded_at"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="h-7 w-[130px] rounded-md border border-input bg-transparent px-2 text-[11px] tabular-nums text-foreground [color-scheme:light]"
              />
              <Input
                name="balance"
                type="number"
                min="0"
                step="0.01"
                placeholder="Balance"
                required
                className="h-7 min-w-0 flex-1 text-xs"
              />
              <Button type="submit" size="xs" variant="outline">Save</Button>
            </form>
          )}
          {isStock && (
            <form action={recordDividendAction} className="flex gap-1.5">
              <input type="hidden" name="account_id" value={account.id} />
              <input
                type="date"
                name="pay_date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="h-7 w-[130px] rounded-md border border-input bg-transparent px-2 text-[11px] tabular-nums text-foreground [color-scheme:light]"
              />
              <Input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Dividend"
                required
                className="h-7 min-w-0 flex-1 text-xs"
              />
              <Button type="submit" size="xs" variant="outline">Add</Button>
            </form>
          )}
          <div className="flex justify-end">
            <form action={deleteAccountAction}>
              <input type="hidden" name="id" value={account.id} />
              <Button type="submit" variant="ghost" size="xs" className="text-muted-foreground/50 hover:text-destructive">
                ×
              </Button>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Section component for a category group ──────────────────── */

function AccountSection({
  title,
  emoji,
  accounts,
  latestBalances,
  fxRates,
}: {
  title: string;
  emoji: string;
  accounts: NetWorthAccount[];
  latestBalances: Map<string, number>;
  fxRates?: Map<string, number>;
}) {
  if (accounts.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">{accounts.length}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => {
          const isStock = account.account_category === "investment";
          const currentValue = isStock && account.current_price && account.quantity
            ? Number(account.current_price) * Number(account.quantity)
            : latestBalances.get(account.id) ?? null;

          let pnlLabel: string | null = null;
          let pnlPositive = false;
          if (isStock && account.buy_price && account.current_price && account.quantity) {
            const cost = Number(account.buy_price) * Number(account.quantity);
            const value = Number(account.current_price) * Number(account.quantity);
            pnlPositive = value >= cost;
            pnlLabel = `${pnlPositive ? "+" : ""}${formatCurrency(value - cost)}`;
          }

          const managedPnl = account.account_category === "managed"
            ? computeManagedPnL(account, latestBalances, fxRates)
            : null;

          return (
            <AccountCard
              key={account.id}
              account={account}
              currentValue={currentValue}
              pnlLabel={pnlLabel}
              pnlPositive={pnlPositive}
              managedPnl={managedPnl}
              fxRates={fxRates}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────────── */

export default async function NetWorthPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const authUserId = await getAuthUserId();

  if (!authUserId) redirect("/login");

  const admin = createServiceClient();
  const { data: currentUser } = await admin
    .from("users")
    .select("id, couple_id, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (!currentUser?.couple_id) redirect("/onboarding");

  const { accounts: typedAccounts, snapshots: typedSnapshots, dividends: typedDividends } =
    await fetchData(currentUser.couple_id);

  // Latest balance per account
  const latestBalances = new Map<string, number>();
  for (const s of typedSnapshots) {
    if (!latestBalances.has(s.account_id)) {
      latestBalances.set(s.account_id, s.balance);
    }
  }

  // Fetch FX rates for all non-SGD currencies
  const uniqueCurrencies = [...new Set(typedAccounts.map((a) => a.currency).filter(Boolean))] as string[];
  const fxRates = await fetchExchangeRates(uniqueCurrencies);

  // Surface FX failures instead of silently mis-valuing foreign balances.
  const missingFxCurrencies = uniqueCurrencies.filter(
    (c) => c !== "SGD" && !fxRates.has(c),
  );
  const fxRatesAvailable = missingFxCurrencies.length === 0;

  // Computed values (all converted to SGD)
  const netWorthTotal = computeNetWorthTotal(typedAccounts, latestBalances, fxRates);
  const stockValue = computeStockValue(typedAccounts, fxRates);
  const stockPnL = computeStockPnL(typedAccounts, fxRates);
  const bankTotal = computeCategoryTotal(typedAccounts, "bank", latestBalances, fxRates);
  const stockTotal = computeCategoryTotal(typedAccounts, "investment", latestBalances, fxRates);
  const managedTotal = computeCategoryTotal(typedAccounts, "managed", latestBalances, fxRates);

  const bankAccounts = getAccountsByCategory(typedAccounts, "bank");
  const stockAccounts = getAccountsByCategory(typedAccounts, "investment");
  const managedAccounts = getAccountsByCategory(typedAccounts, "managed");

  // Stock-only history & per-ticker data for the stock performance chart
  const stockHistory = computeStockHistory(typedAccounts, typedSnapshots, fxRates);
  const stockCostBasis = computeStockCost(typedAccounts, fxRates);
  const stockTickers = stockAccounts
    .filter((a) => a.include_in_net_worth)
    .filter((a): a is NetWorthAccount & { ticker: string } => !!a.ticker)
    .map((a) => {
      const valueInSgd = toSgd(
        Number(a.current_price!) * Number(a.quantity!),
        a.currency,
        fxRates ?? new Map(),
      );
      const costInSgd = a.buy_price
        ? toSgd(Number(a.buy_price) * Number(a.quantity!), a.currency, fxRates ?? new Map())
        : 0;
      const pnl = valueInSgd - costInSgd;
      const pnlPercent = costInSgd > 0 ? (pnl / costInSgd) * 100 : 0;
      return {
        ticker: a.ticker,
        valueInSgd: Math.round(valueInSgd * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 10) / 10,
      };
    });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <ErrorBanner error={resolvedSearchParams.error} />

      {!fxRatesAvailable && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Exchange rates for {missingFxCurrencies.join(", ")} are unavailable
          right now, so foreign-currency balances may be shown incorrectly.
          Try refreshing prices shortly.
        </div>
      )}

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Total net worth
            </p>
            <p className="text-5xl font-semibold tracking-tight text-foreground sm:text-6xl lg:text-7xl tabular-nums">
              <span>{netWorthTotal >= 0 ? "" : "−"}</span>
              S$&thinsp;{formatNetWorth(Math.abs(netWorthTotal))}
            </p>

            {/* Stacked bar + percentage legend */}
            <CompositionBar
              total={netWorthTotal}
              bankTotal={bankTotal}
              stockTotal={stockTotal}
              managedTotal={managedTotal}
            />

            <div className="mt-1 flex items-center gap-3">
              {stockPnL.pnl !== 0 && (
                <span
                  className={`inline-flex items-center gap-1 text-sm tabular-nums ${
                    stockPnL.pnl >= 0 ? "text-emerald-500" : "text-destructive"
                  }`}
                >
                  <TrendArrow value={stockPnL.pnl} />
                  {formatCurrency(stockPnL.pnl)} ({stockPnL.pnlPercent.toFixed(1)}%)
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                from {typedAccounts.length} account{typedAccounts.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <BackfillDialog backfillAction={bulkBackfillAction} />
            <form action={refreshStockPricesAction}>
              <Button type="submit" variant="outline" size="sm">
                Refresh prices
              </Button>
            </form>
          </div>
        </div>

      </section>

      {/* ─── Stock Performance Chart ─── */}
      {stockHistory.length > 0 && (
        <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card p-6 sm:p-8 lg:p-10">
          <StockPerformanceChart
            history={stockHistory}
            costBasis={stockCostBasis}
            tickers={stockTickers}
          />
        </section>
      )}

      {/* ─── Add account form (client component) ─── */}
      <AddAccountForm createAccount={createAccountAction} />

      {/* ─── Account sections ─── */}
      <div className="space-y-8">
        <AccountSection
          title="Bank Accounts"
          emoji="🏦"
          accounts={bankAccounts}
          latestBalances={latestBalances}
          fxRates={fxRates}
        />
        <AccountSection
          title="Stock Holdings"
          emoji="📈"
          accounts={stockAccounts}
          latestBalances={latestBalances}
          fxRates={fxRates}
        />
        <AccountSection
          title="Managed Funds"
          emoji="🤖"
          accounts={managedAccounts}
          latestBalances={latestBalances}
          fxRates={fxRates}
        />
      </div>

      {/* ─── Balance history ─── */}
      {typedSnapshots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Balance history</CardTitle>
            <CardDescription>Recent balance snapshots across all accounts. Showing the 20 most recent.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Account</th>
                    <th className="pb-2 pr-4">Balance</th>
                    <th className="pb-2 pr-4">Notes</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {typedSnapshots.slice(0, 20).map((snapshot) => {
                    const account = typedAccounts.find((a) => a.id === snapshot.account_id);
                    return (
                      <tr key={snapshot.id} className="border-b border-border/40">
                        <td className="py-2 pr-4 tabular-nums text-foreground">{snapshot.recorded_at}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{account?.name ?? "Deleted account"}</td>
                        <td className="py-2 pr-4 font-medium tabular-nums text-foreground">{formatCurrency(snapshot.balance)}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{snapshot.notes ?? "—"}</td>
                        <td className="py-2">
                          <form action={deleteBalanceAction}>
                            <input type="hidden" name="id" value={snapshot.id} />
                            <input type="hidden" name="account_id" value={snapshot.account_id} />
                            <Button type="submit" variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive">Delete</Button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Dividend history ─── */}
      {typedDividends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dividend history</CardTitle>
            <CardDescription>All dividends received across your stock holdings. Showing the 20 most recent.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Account</th>
                    <th className="pb-2 pr-4">Amount</th>
                    <th className="pb-2 pr-4">Notes</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {typedDividends.map((dividend) => {
                    const account = typedAccounts.find((a) => a.id === dividend.account_id);
                    return (
                      <tr key={dividend.id} className="border-b border-border/40">
                        <td className="py-2 pr-4 tabular-nums text-foreground">{dividend.pay_date}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{account?.name ?? "Deleted account"}</td>
                        <td className="py-2 pr-4 font-medium tabular-nums text-emerald-500">+{formatCurrency(dividend.amount)}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{dividend.notes ?? "—"}</td>
                        <td className="py-2">
                          <form action={deleteDividendAction}>
                            <input type="hidden" name="id" value={dividend.id} />
                            <input type="hidden" name="account_id" value={dividend.account_id} />
                            <Button type="submit" variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive">Delete</Button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
