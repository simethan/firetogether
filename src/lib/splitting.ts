/**
 * Group splitting engine (ported from SmartSplit).
 *
 * Pure functions only — no imports — so the SmartSplit import script can
 * run it directly under Node.
 *
 * Conventions:
 * - Amounts are in major units (dollars) and rounded to cents.
 * - A positive balance means others owe that member; negative means they owe.
 * - Rates map a currency to its value in the group's base currency
 *   (1 unit of currency = rate units of base). The base currency itself is 1.
 */

export type SplitMethod = "equal" | "percentage" | "custom";

export type SplitItemInput = {
  lineTotal: number;
  splitMethod: SplitMethod;
  /** equal: weight (usually 1) · percentage: percent · custom: exact amount */
  assignments: { memberId: string; share: number }[];
};

export type ExpenseCharges = {
  serviceChargePercent: number | null;
  taxPercent: number | null;
  discount: number;
};

export type LedgerAssignment = { memberId: string; amount: number };

export type LedgerItem = {
  id: string;
  name?: string;
  paidByMemberId: string | null;
  category: string | null;
  lineTotal?: number;
  assignments: LedgerAssignment[];
};

export type LedgerExpense = {
  id: string;
  date: string;
  currency: string;
  total: number;
  merchant?: string | null;
  category: string;
  paidByMemberId: string | null;
  items: LedgerItem[];
};

export type LedgerPayment = {
  id: string;
  payerMemberId: string;
  receiverMemberId: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export type Rates = Record<string, number>;

export type Transfer = {
  from: string;
  to: string;
  amount: number;
  currency: string;
};

export type BalanceOptions = {
  baseCurrency: string;
  rates: Rates;
  /** Convert every currency into the base currency (when a rate exists). */
  convert: boolean;
};

const EPSILON = 0.005;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Split `total` across keys proportionally to their weights so the parts add
 * up to `total` exactly (largest-remainder rounding at the cent level).
 */
export function splitByWeights<K>(
  total: number,
  weights: { key: K; weight: number }[],
): Map<K, number> {
  const result = new Map<K, number>();
  const positive = weights.filter((w) => w.weight > 0);
  const weightSum = positive.reduce((sum, w) => sum + w.weight, 0);
  if (positive.length === 0 || weightSum <= 0) return result;

  const totalCents = toCents(total);
  const exact = positive.map((w) => (totalCents * w.weight) / weightSum);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = totalCents - floors.reduce((sum, v) => sum + v, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder -= 1;
  }

  positive.forEach((w, index) => {
    result.set(w.key, (result.get(w.key) ?? 0) + floors[index] / 100);
  });
  return result;
}

export function itemsSubtotal(items: { lineTotal: number }[]): number {
  return round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
}

/** Discount first, then service charge, then tax on top (the Singapore receipt order). */
export function computeExpenseTotal(subtotal: number, charges: ExpenseCharges): number {
  const afterDiscount = Math.max(0, subtotal - (charges.discount || 0));
  const withService = afterDiscount * (1 + (charges.serviceChargePercent ?? 0) / 100);
  return round2(withService * (1 + (charges.taxPercent ?? 0) / 100));
}

export function validateItemSplit(item: SplitItemInput): string | null {
  const assigned = item.assignments.filter((a) => a.share > 0);
  if (assigned.length === 0) return null;

  if (item.splitMethod === "percentage") {
    const sum = assigned.reduce((s, a) => s + a.share, 0);
    if (Math.abs(sum - 100) > 0.01) {
      return `Percentages add up to ${round2(sum)}%, need 100%.`;
    }
  }

  if (item.splitMethod === "custom") {
    const sum = assigned.reduce((s, a) => s + a.share, 0);
    if (Math.abs(sum - item.lineTotal) > 0.02) {
      return `Amounts add up to ${round2(sum).toFixed(2)}, need ${item.lineTotal.toFixed(2)}.`;
    }
  }

  return null;
}

/**
 * Turn per-item split choices into cached assignment amounts in the expense
 * currency. The expense total (after discount, service charge and tax) is
 * first spread across items by line total, then each item's portion is
 * split across its assignees — so everything adds up to the total exactly.
 */
export function computeAssignmentAmounts(
  items: SplitItemInput[],
  total: number,
): Map<string, number>[] {
  const itemTotals = splitByWeights(
    total,
    items.map((item, index) => ({ key: index, weight: Math.max(0, item.lineTotal) })),
  );

  return items.map((item, index) => {
    const portion = itemTotals.get(index) ?? 0;
    const weights = item.assignments
      .filter((a) => a.share > 0)
      .map((a) => ({ key: a.memberId, weight: a.share }));
    return splitByWeights(portion, weights);
  });
}

/** Evenly split an amount into percentages that add up to exactly 100. */
export function evenPercentages(memberIds: string[]): Map<string, number> {
  return splitByWeights(100, memberIds.map((id) => ({ key: id, weight: 1 })));
}

// ============================================
// Currency
// ============================================

export function rateFor(currency: string, options: Pick<BalanceOptions, "baseCurrency" | "rates">): number | null {
  if (currency === options.baseCurrency) return 1;
  const rate = options.rates[currency];
  return rate && rate > 0 ? rate : null;
}

/** The currency bucket an amount lands in, and the amount in that bucket. */
function bucket(
  amount: number,
  currency: string,
  options: BalanceOptions,
): { currency: string; amount: number } {
  if (!options.convert) return { currency, amount };
  const rate = rateFor(currency, options);
  if (rate == null) return { currency, amount };
  return { currency: options.baseCurrency, amount: amount * rate };
}

export function missingRates(
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
  options: Pick<BalanceOptions, "baseCurrency" | "rates">,
): string[] {
  const currencies = new Set<string>([
    ...expenses.map((e) => e.currency),
    ...payments.map((p) => p.currency),
  ]);
  return [...currencies].filter((c) => rateFor(c, options) == null).sort();
}

// ============================================
// Balances and settlement
// ============================================

function itemPayer(expense: LedgerExpense, item: LedgerItem): string | null {
  return item.paidByMemberId ?? expense.paidByMemberId;
}

type NestedTotals = Map<string, Map<string, number>>;

function addNested(map: NestedTotals, currency: string, key: string, amount: number) {
  let inner = map.get(currency);
  if (!inner) {
    inner = new Map();
    map.set(currency, inner);
  }
  inner.set(key, (inner.get(key) ?? 0) + amount);
}

function roundNested(map: NestedTotals): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [currency, inner] of map) {
    out[currency] = {};
    for (const [key, value] of inner) out[currency][key] = round2(value);
  }
  return out;
}

/** Net balance per member, grouped by currency bucket. */
export function computeBalances(
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
  options: BalanceOptions,
): Record<string, Record<string, number>> {
  const totals: NestedTotals = new Map();

  for (const expense of expenses) {
    for (const item of expense.items) {
      const payer = itemPayer(expense, item);
      if (!payer) continue;
      for (const assignment of item.assignments) {
        if (assignment.memberId === payer) continue;
        const b = bucket(assignment.amount, expense.currency, options);
        addNested(totals, b.currency, payer, b.amount);
        addNested(totals, b.currency, assignment.memberId, -b.amount);
      }
    }
  }

  for (const payment of payments) {
    if (payment.status !== "approved") continue;
    const b = bucket(payment.amount, payment.currency, options);
    addNested(totals, b.currency, payment.payerMemberId, b.amount);
    addNested(totals, b.currency, payment.receiverMemberId, -b.amount);
  }

  return roundNested(totals);
}

/**
 * Pairwise debts netted per pair, without simplification ("Direct debts").
 */
export function directDebts(
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
  options: BalanceOptions,
): Transfer[] {
  const owes: NestedTotals = new Map();
  const pairKey = (from: string, to: string) => `${from}\u0000${to}`;

  for (const expense of expenses) {
    for (const item of expense.items) {
      const payer = itemPayer(expense, item);
      if (!payer) continue;
      for (const assignment of item.assignments) {
        if (assignment.memberId === payer) continue;
        const b = bucket(assignment.amount, expense.currency, options);
        addNested(owes, b.currency, pairKey(assignment.memberId, payer), b.amount);
      }
    }
  }

  for (const payment of payments) {
    if (payment.status !== "approved") continue;
    const b = bucket(payment.amount, payment.currency, options);
    addNested(owes, b.currency, pairKey(payment.payerMemberId, payment.receiverMemberId), -b.amount);
  }

  const transfers: Transfer[] = [];
  for (const [currency, inner] of owes) {
    const seen = new Set<string>();
    for (const key of inner.keys()) {
      const [a, b] = key.split("\u0000");
      const canonical = a < b ? pairKey(a, b) : pairKey(b, a);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const net = round2((inner.get(pairKey(a, b)) ?? 0) - (inner.get(pairKey(b, a)) ?? 0));
      if (net > EPSILON) transfers.push({ from: a, to: b, amount: net, currency });
      else if (net < -EPSILON) transfers.push({ from: b, to: a, amount: -net, currency });
    }
  }

  return transfers.sort((x, y) => y.amount - x.amount);
}

/**
 * Greedy minimum-transfer plan: repeatedly match the biggest debtor with the
 * biggest creditor.
 */
export function simplifyDebts(balances: Record<string, number>, currency: string): Transfer[] {
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > EPSILON)
    .map(([id, v]) => ({ id, cents: toCents(v) }));
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < -EPSILON)
    .map(([id, v]) => ({ id, cents: -toCents(v) }));

  const transfers: Transfer[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
    debtors.sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
    const creditor = creditors[0];
    const debtor = debtors[0];
    const cents = Math.min(creditor.cents, debtor.cents);
    if (cents > 0) {
      transfers.push({ from: debtor.id, to: creditor.id, amount: cents / 100, currency });
    }
    creditor.cents -= cents;
    debtor.cents -= cents;
    if (creditor.cents <= 0) creditors.shift();
    if (debtor.cents <= 0) debtors.shift();
  }
  return transfers;
}

export function settlementPlan(
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
  options: BalanceOptions & { simplify: boolean },
): Transfer[] {
  if (!options.simplify) return directDebts(expenses, payments, options);
  const balances = computeBalances(expenses, payments, options);
  return Object.entries(balances).flatMap(([currency, perMember]) =>
    simplifyDebts(perMember, currency),
  );
}

/** Sum of what everyone is still owed — SmartSplit's "outstanding debt". */
export function outstandingDebt(balances: Record<string, Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [currency, perMember] of Object.entries(balances)) {
    out[currency] = round2(
      Object.values(perMember).filter((v) => v > 0).reduce((s, v) => s + v, 0),
    );
  }
  return out;
}

// ============================================
// Payment allocation (item locks)
// ============================================

export function assignmentKey(itemId: string, memberId: string) {
  return `${itemId}:${memberId}`;
}

/**
 * Allocate approved payments, oldest first, to the debts they pay off
 * (member → item payer, same currency, oldest expense first). Items with any
 * settled assignment are locked from editing.
 */
export function allocatePayments(
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
): Map<string, number> {
  const settled = new Map<string, number>();
  const sortedExpenses = [...expenses].sort((a, b) => a.date.localeCompare(b.date));

  const approved = payments
    .filter((p) => p.status === "approved")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const payment of approved) {
    let remaining = toCents(payment.amount);
    for (const expense of sortedExpenses) {
      if (remaining <= 0) break;
      if (expense.currency !== payment.currency) continue;
      for (const item of expense.items) {
        if (remaining <= 0) break;
        if (itemPayer(expense, item) !== payment.receiverMemberId) continue;
        const assignment = item.assignments.find((a) => a.memberId === payment.payerMemberId);
        if (!assignment) continue;
        const key = assignmentKey(item.id, assignment.memberId);
        const already = toCents(settled.get(key) ?? 0);
        const open = toCents(assignment.amount) - already;
        if (open <= 0) continue;
        const take = Math.min(open, remaining);
        settled.set(key, (already + take) / 100);
        remaining -= take;
      }
    }
  }

  return settled;
}

export function lockedItemIds(settled: Map<string, number>): Set<string> {
  const locked = new Set<string>();
  for (const [key, amount] of settled) {
    if (amount > 0) locked.add(key.split(":")[0]);
  }
  return locked;
}

// ============================================
// Per-member views
// ============================================

export type LedgerEntryKind = "share" | "paid_for_others" | "payment_sent" | "payment_received";

export type LedgerEntry = {
  date: string;
  kind: LedgerEntryKind;
  description: string;
  /** In the entry's currency bucket; positive raises the member's balance. */
  amount: number;
  currency: string;
  expenseId?: string;
  paymentId?: string;
  category?: string;
  counterpartyId?: string;
};

/**
 * Every movement in one member's group balance — the IOU account register.
 * Summing the entries per currency gives the same result as computeBalances.
 */
export function memberLedger(
  memberId: string,
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
  options: BalanceOptions,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const expense of expenses) {
    const label = expense.merchant || expense.category;
    const paidForOthers = new Map<string, number>();
    const myShare = new Map<string, { amount: number; category: string; payer: string }>();

    for (const item of expense.items) {
      const payer = itemPayer(expense, item);
      if (!payer) continue;
      for (const assignment of item.assignments) {
        if (assignment.memberId === payer) continue;
        const b = bucket(assignment.amount, expense.currency, options);
        if (payer === memberId) {
          paidForOthers.set(b.currency, (paidForOthers.get(b.currency) ?? 0) + b.amount);
        }
        if (assignment.memberId === memberId) {
          const category = item.category || expense.category;
          const key = `${b.currency}\u0000${category}\u0000${payer}`;
          const current = myShare.get(key);
          myShare.set(key, {
            amount: (current?.amount ?? 0) + b.amount,
            category,
            payer,
          });
        }
      }
    }

    for (const [currency, amount] of paidForOthers) {
      entries.push({
        date: expense.date,
        kind: "paid_for_others",
        description: `You paid for others · ${label}`,
        amount: round2(amount),
        currency,
        expenseId: expense.id,
        category: expense.category,
      });
    }
    for (const [key, share] of myShare) {
      entries.push({
        date: expense.date,
        kind: "share",
        description: `Your share · ${label}`,
        amount: -round2(share.amount),
        currency: key.split("\u0000")[0],
        expenseId: expense.id,
        category: share.category,
        counterpartyId: share.payer,
      });
    }
  }

  for (const payment of payments) {
    if (payment.status !== "approved") continue;
    const b = bucket(payment.amount, payment.currency, options);
    if (payment.payerMemberId === memberId) {
      entries.push({
        date: payment.createdAt.slice(0, 10),
        kind: "payment_sent",
        description: "Settlement sent",
        amount: round2(b.amount),
        currency: b.currency,
        paymentId: payment.id,
        counterpartyId: payment.receiverMemberId,
      });
    } else if (payment.receiverMemberId === memberId) {
      entries.push({
        date: payment.createdAt.slice(0, 10),
        kind: "payment_received",
        description: "Settlement received",
        amount: -round2(b.amount),
        currency: b.currency,
        paymentId: payment.id,
        counterpartyId: payment.payerMemberId,
      });
    }
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export function ledgerTotals(entries: LedgerEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of entries) {
    out[entry.currency] = round2((out[entry.currency] ?? 0) + entry.amount);
  }
  return out;
}

/** A member's share of each expense, in the expense currency. */
export function memberShares(memberId: string, expenses: LedgerExpense[]) {
  return expenses
    .map((expense) => {
      const byCategory = new Map<string, number>();
      for (const item of expense.items) {
        for (const assignment of item.assignments) {
          if (assignment.memberId !== memberId) continue;
          const category = item.category || expense.category;
          byCategory.set(category, (byCategory.get(category) ?? 0) + assignment.amount);
        }
      }
      const amount = round2([...byCategory.values()].reduce((s, v) => s + v, 0));
      return { expense, amount, byCategory };
    })
    .filter((row) => row.amount > 0);
}

// ============================================
// Insights
// ============================================

export type SpendingInsights = {
  totalSpend: number;
  byCategory: Record<string, number>;
  byMember: Record<string, number>;
  byMonth: Record<string, number>;
  unassigned: number;
};

/** Group spending in the base currency (expenses without a rate are skipped). */
export function spendingInsights(
  expenses: LedgerExpense[],
  options: Pick<BalanceOptions, "baseCurrency" | "rates">,
  onlyMemberId?: string,
): SpendingInsights {
  const insights: SpendingInsights = {
    totalSpend: 0,
    byCategory: {},
    byMember: {},
    byMonth: {},
    unassigned: 0,
  };

  for (const expense of expenses) {
    const rate = rateFor(expense.currency, options);
    if (rate == null) continue;
    const month = expense.date.slice(0, 7);
    let assignedTotal = 0;

    for (const item of expense.items) {
      for (const assignment of item.assignments) {
        assignedTotal += assignment.amount;
        if (onlyMemberId && assignment.memberId !== onlyMemberId) continue;
        const value = assignment.amount * rate;
        const category = item.category || expense.category;
        insights.byCategory[category] = (insights.byCategory[category] ?? 0) + value;
        insights.byMember[assignment.memberId] = (insights.byMember[assignment.memberId] ?? 0) + value;
        insights.byMonth[month] = (insights.byMonth[month] ?? 0) + value;
        if (onlyMemberId) insights.totalSpend += value;
      }
    }

    if (!onlyMemberId) {
      insights.totalSpend += expense.total * rate;
      insights.unassigned += Math.max(0, expense.total - assignedTotal) * rate;
    }
  }

  const roundRecord = (record: Record<string, number>) => {
    for (const key of Object.keys(record)) record[key] = round2(record[key]);
  };
  roundRecord(insights.byCategory);
  roundRecord(insights.byMember);
  roundRecord(insights.byMonth);
  insights.totalSpend = round2(insights.totalSpend);
  insights.unassigned = round2(insights.unassigned);
  return insights;
}

/** Start of the current budget period for a group budget. */
export function budgetPeriodStart(period: "weekly" | "monthly" | "total", today: Date): string | null {
  if (period === "total") return null;
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (period === "monthly") {
    d.setUTCDate(1);
  } else {
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  }
  return d.toISOString().slice(0, 10);
}
