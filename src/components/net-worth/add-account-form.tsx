"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { TickerSearch } from "./ticker-search";
import { AccountGlyph } from "@/components/brand/marks";

type Category = "bank" | "investment" | "managed";

const categoryMeta: Record<
  Category,
  { label: string; glyph: Category }
> = {
  bank: { label: "Bank", glyph: "bank" },
  investment: { label: "Stocks", glyph: "investment" },
  managed: { label: "Managed", glyph: "managed" },
};

const bankPresets = ["DBS", "OCBC", "UOB", "Maybank", "CIMB", "Standard Chartered", "Citibank", "Trust Bank"];

const brokerPresets = ["Syfe", "Endowus", "Interactive Brokers", "Tiger Brokers", "Moomoo", "Saxo", "Other"];

const managedPresets = ["Syfe", "Endowus", "StashAway", "MoneyOwl", "Other"];

type Props = {
  createAccount: (formData: FormData) => Promise<void>;
};

/** Small chip that toggles a preset value into the bound state. */
function Chip({
  name,
  active,
  onSelect,
}: {
  name: string;
  active: boolean;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      className={cn(
        "rounded-lg border px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
      )}
    >
      {name}
    </button>
  );
}

export function AddAccountForm({ createAccount }: Props) {
  const [category, setCategory] = useState<Category>("bank");
  const [ticker, setTicker] = useState("");
  const [exchange, setExchange] = useState("");
  const [bankName, setBankName] = useState("");
  const [investBroker, setInvestBroker] = useState("");
  const [managedBroker, setManagedBroker] = useState("");
  const meta = categoryMeta[category];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add account</CardTitle>
        <CardDescription>
          Track a bank account, stock holding, or managed portfolio.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Category tabs */}
        <div className="mb-5 flex gap-1 rounded-xl bg-muted p-1">
          {(Object.entries(categoryMeta) as [Category, typeof meta][]).map(
            ([key, m]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium transition-all",
                  category === key
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <AccountGlyph kind={m.glyph} className="h-4 w-4" />
                <span>{m.label}</span>
              </button>
            ),
          )}
        </div>

        <form action={createAccount} className="space-y-4">
          <input type="hidden" name="account_category" value={category} />

          {/* Common fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ac-name">Account name</Label>
              <Input id="ac-name" name="name" placeholder="e.g. Joint Savings" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-currency">Currency</Label>
              <Input id="ac-currency" name="currency" placeholder="SGD" defaultValue="SGD" />
            </div>
          </div>

          {/* ─── Bank fields ─── */}
          {category === "bank" && (
            <>
              <Separator />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Bank details
              </p>
              <div className="space-y-1.5">
                <Label>Bank name</Label>
                <div className="flex flex-wrap gap-1.5">
                  {bankPresets.map((b) => (
                    <Chip
                      key={b}
                      name={b}
                      active={bankName === b}
                      onSelect={(n) => setBankName(bankName === n ? "" : n)}
                    />
                  ))}
                </div>
                <Input
                  id="ac-bank-name"
                  name="bank_name"
                  placeholder="Or type a bank name"
                  className="mt-1.5"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ac-account-number">Account number (optional)</Label>
                  <Input id="ac-account-number" name="account_number" placeholder="123-456-789-0" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ac-initial-balance">Current balance</Label>
                  <Input id="ac-initial-balance" name="initial_balance" type="number" min="0" step="0.01" placeholder="42,000.00" />
                </div>
              </div>
            </>
          )}

          {/* ─── Investment fields ─── */}
          {category === "investment" && (
            <>
              <Separator />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Broker &amp; stock details
              </p>
              <div className="space-y-1.5">
                <Label>Broker</Label>
                <div className="flex flex-wrap gap-1.5">
                  {brokerPresets.map((b) => (
                    <Chip
                      key={b}
                      name={b}
                      active={investBroker === b}
                      onSelect={(n) => setInvestBroker(investBroker === n ? "" : n)}
                    />
                  ))}
                </div>
                <Input
                  id="ac-broker-input"
                  name="broker"
                  placeholder="Or type a broker"
                  className="mt-1.5"
                  value={investBroker}
                  onChange={(e) => setInvestBroker(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ticker</Label>
                <TickerSearch value={ticker} onChange={(sym, _name, exch) => { setTicker(sym); setExchange(exch); }} />
                <input type="hidden" name="ticker" value={ticker} />
                <input type="hidden" name="exchange" value={exchange} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ac-quantity">Quantity</Label>
                  <Input id="ac-quantity" name="quantity" type="number" min="0" step="0.0001" placeholder="100" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ac-buy-price">Buy price</Label>
                  <Input id="ac-buy-price" name="buy_price" type="number" min="0" step="0.01" placeholder="150.00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ac-current-price">Current price</Label>
                  <Input id="ac-current-price" name="current_price" type="number" min="0" step="0.01" placeholder="Auto-fetched" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ac-initial-investment">Total invested (optional)</Label>
                <Input id="ac-initial-investment" name="initial_investment" type="number" min="0" step="0.01" placeholder="15,000.00" />
              </div>
            </>
          )}

          {/* ─── Managed fields ─── */}
          {category === "managed" && (
            <>
              <Separator />
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Managed account details
              </p>
              <div className="space-y-1.5">
                <Label>Platform / Manager</Label>
                <div className="flex flex-wrap gap-1.5">
                  {managedPresets.map((b) => (
                    <Chip
                      key={b}
                      name={b}
                      active={managedBroker === b}
                      onSelect={(n) => setManagedBroker(managedBroker === n ? "" : n)}
                    />
                  ))}
                </div>
                <Input
                  id="ac-managed-broker-input"
                  name="broker"
                  placeholder="Platform name"
                  className="mt-1.5"
                  value={managedBroker}
                  onChange={(e) => setManagedBroker(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ac-managed-initial">Initial investment</Label>
                  <Input id="ac-managed-initial" name="initial_investment" type="number" min="0" step="0.01" placeholder="20,000.00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ac-managed-current">Current balance</Label>
                  <Input id="ac-managed-current" name="current_balance" type="number" min="0" step="0.01" placeholder="24,500.00" />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit">Add {meta.label} account</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
