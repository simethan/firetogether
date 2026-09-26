import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/smartsplit-group.json";
import {
  allocatePayments,
  computeAssignmentAmounts,
  computeBalances,
  computeExpenseTotal,
  directDebts,
  ledgerTotals,
  lockedItemIds,
  memberLedger,
  outstandingDebt,
  settlementPlan,
  simplifyDebts,
  spendingInsights,
  splitByWeights,
  validateItemSplit,
  type LedgerExpense,
  type LedgerPayment,
} from "./splitting";

const expenses = fixture.expenses as LedgerExpense[];
const payments = fixture.payments as LedgerPayment[];
const base = { baseCurrency: fixture.baseCurrency, rates: {}, convert: true };

describe("golden: SmartSplit group", () => {
  it("matches SmartSplit's net balances", () => {
    const balances = computeBalances(expenses, payments, base)[fixture.baseCurrency];
    const nonZero = Object.fromEntries(Object.entries(balances).filter(([, v]) => Math.abs(v) > 0.005));
    expect(nonZero).toEqual(fixture.expected.balances);
  });

  it("matches SmartSplit's total spend and outstanding debt", () => {
    expect(spendingInsights(expenses, base).totalSpend).toBe(fixture.expected.totalSpend);
    const balances = computeBalances(expenses, payments, base);
    expect(outstandingDebt(balances)[fixture.baseCurrency]).toBe(fixture.expected.outstandingDebt);
  });

  it("matches SmartSplit's simplified settlement plan", () => {
    const plan = settlementPlan(expenses, payments, { ...base, simplify: true });
    expect(plan.map(({ from, to, amount }) => ({ from, to, amount }))).toEqual(fixture.expected.settlements);
  });

  it("keeps every member's IOU ledger in sync with their balance", () => {
    const balances = computeBalances(expenses, payments, base)[fixture.baseCurrency];
    for (const [memberId, balance] of Object.entries(balances)) {
      const totals = ledgerTotals(memberLedger(memberId, expenses, payments, base));
      expect(totals[fixture.baseCurrency] ?? 0).toBeCloseTo(balance, 2);
    }
  });
});

describe("splitByWeights", () => {
  it("adds up to the total exactly", () => {
    const parts = splitByWeights(11.95, ["a", "b", "c", "d"].map((key) => ({ key, weight: 1 })));
    expect([...parts.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(11.95, 10);
    expect([...parts.values()].sort()).toEqual([2.98, 2.99, 2.99, 2.99]);
  });

  it("ignores zero weights", () => {
    const parts = splitByWeights(10, [
      { key: "a", weight: 0 },
      { key: "b", weight: 1 },
    ]);
    expect(parts.get("a")).toBeUndefined();
    expect(parts.get("b")).toBe(10);
  });
});

describe("computeExpenseTotal", () => {
  it("applies discount, then service charge, then GST", () => {
    expect(computeExpenseTotal(100, { discount: 10, serviceChargePercent: 10, taxPercent: 9 })).toBe(107.91);
  });
});

describe("computeAssignmentAmounts", () => {
  it("prorates charges across items and members", () => {
    const [shares] = computeAssignmentAmounts(
      [
        {
          lineTotal: 15.8,
          splitMethod: "equal",
          assignments: ["a", "b", "c"].map((memberId) => ({ memberId, share: 1 })),
        },
      ],
      17.38,
    );
    expect([...shares.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(17.38, 10);
  });

  it("supports percentage and custom splits", () => {
    const [pct, custom] = computeAssignmentAmounts(
      [
        {
          lineTotal: 50,
          splitMethod: "percentage",
          assignments: [
            { memberId: "a", share: 70 },
            { memberId: "b", share: 30 },
          ],
        },
        {
          lineTotal: 50,
          splitMethod: "custom",
          assignments: [
            { memberId: "a", share: 20 },
            { memberId: "b", share: 30 },
          ],
        },
      ],
      110,
    );
    expect(pct.get("a")).toBe(38.5);
    expect(pct.get("b")).toBe(16.5);
    expect(custom.get("a")).toBe(22);
    expect(custom.get("b")).toBe(33);
  });

  it("validates percentage and custom totals", () => {
    expect(
      validateItemSplit({
        lineTotal: 10,
        splitMethod: "percentage",
        assignments: [{ memberId: "a", share: 90 }],
      }),
    ).toMatch(/100%/);
    expect(
      validateItemSplit({
        lineTotal: 10,
        splitMethod: "custom",
        assignments: [{ memberId: "a", share: 10 }],
      }),
    ).toBeNull();
  });
});

describe("settlement", () => {
  const triangle: LedgerExpense[] = [
    {
      id: "x",
      date: "2026-01-01",
      currency: "SGD",
      total: 30,
      category: "Food",
      paidByMemberId: "B",
      items: [{ id: "x1", paidByMemberId: null, category: null, assignments: [{ memberId: "A", amount: 30 }] }],
    },
    {
      id: "y",
      date: "2026-01-02",
      currency: "SGD",
      total: 30,
      category: "Food",
      paidByMemberId: "C",
      items: [{ id: "y1", paidByMemberId: null, category: null, assignments: [{ memberId: "B", amount: 30 }] }],
    },
  ];

  it("simplifies A→B→C into A→C", () => {
    expect(settlementPlan(triangle, [], { ...base, simplify: true })).toEqual([
      { from: "A", to: "C", amount: 30, currency: "SGD" },
    ]);
    expect(directDebts(triangle, [], base)).toHaveLength(2);
  });

  it("keeps currencies apart when not converting", () => {
    const usd: LedgerExpense = { ...triangle[0], id: "z", currency: "USD", items: [{ ...triangle[0].items[0], id: "z1" }] };
    const balances = computeBalances([triangle[0], usd], [], { baseCurrency: "SGD", rates: { USD: 1.3 }, convert: false });
    expect(Object.keys(balances).sort()).toEqual(["SGD", "USD"]);
    const converted = computeBalances([triangle[0], usd], [], { baseCurrency: "SGD", rates: { USD: 1.3 }, convert: true });
    expect(converted.SGD.A).toBe(-69);
  });

  it("greedy plan never exceeds n-1 transfers", () => {
    const plan = simplifyDebts({ a: 50, b: 25, c: -40, d: -35 }, "SGD");
    expect(plan.length).toBeLessThanOrEqual(3);
    expect(plan.reduce((s, t) => s + t.amount, 0)).toBe(75);
  });

  it("locks items once a payment settles them", () => {
    const payment: LedgerPayment = {
      id: "p",
      payerMemberId: "A",
      receiverMemberId: "B",
      amount: 10,
      currency: "SGD",
      status: "approved",
      createdAt: "2026-01-03T00:00:00Z",
    };
    const settled = allocatePayments(triangle, [payment]);
    expect(settled.get("x1:A")).toBe(10);
    expect(lockedItemIds(settled)).toEqual(new Set(["x1"]));
  });
});
