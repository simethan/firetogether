import { toSgd } from "@/lib/fx";
import type {
  AccountBalanceSnapshot,
  AccountCategory,
  Budget,
  Category,
  Expense,
  Income,
  NetWorthAccount,
  SavingsGoal,
  User,
} from "@/lib/types";

type DashboardExpenseWithCategory = Expense & {
  categories?: Category | null;
  users?: User | null;
};

type MemberBalance = {
  userId: string;
  name: string;
  paid: number;
  owed: number;
};

export type CategorySummary = {
  categoryId: string | null;
  name: string;
  amount: number;
  budget: number | null;
  remaining: number | null;
};

type DashboardSummary = {
  totalSpent: number;
  sharedSpent: number;
  personalSpent: number;
  balanceA: MemberBalance | null;
  balanceB: MemberBalance | null;
  categorySummaries: CategorySummary[];
};

export type MonthlyTrend = {
  month: string;
  label: string;
  total: number;
  sharedSpent: number;
  personalSpent: number;
};

export type BalancePoint = {
  month: string;
  label: string;
  paidBy: { userId: string; name: string; amount: number };
  paidByPartner: { userId: string; name: string; amount: number };
  netBalance: number;
};

export type StreakInfo = {
  currentStreak: number;
  longestStreak: number;
  totalExpenses: number;
  firstExpenseDate: string | null;
  expenseDates: string[];
};

export type RecurringExpense = {
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string | null;
  amount: number;
  monthsAppeared: number;
  months: string[];
  description: string | null;
};

export type SpendingInsight = {
  type: "increase" | "decrease" | "new" | "milestone";
  categoryName: string;
  categoryIcon: string | null;
  currentAmount: number;
  previousAmount: number;
  percentChange: number;
  message: string;
};

export type MonthlyHistory = {
  month: string;
  label: string;
  amount: number;
};

export function getCurrentMonthValue(timeZone = "Asia/Singapore"): string {
  // Use the user's timezone so "current month" matches what they see locally
  // (avoids UTC drift that hides early-month expenses in positive offsets).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export function getMonthStartDate(monthValue: string) {
  return `${monthValue}-01`;
}

export function getNextMonthEnd(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

export function getMonthOffset(monthsBack: number, fromMonth?: string) {
  const [year, month] = (fromMonth ?? getCurrentMonthValue())
    .split("-")
    .map(Number);
  const totalMonths = year * 12 + month - 1 - monthsBack;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12 + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function getLastNMonths(count: number, fromMonth?: string): string[] {
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.push(getMonthOffset(i, fromMonth));
  }
  return months;
}

export function formatCurrency(amount: number, currency = "SGD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatMonthLabel(monthValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthValue}-01T00:00:00`));
}

export function formatShortMonthLabel(monthValue: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(new Date(`${monthValue}-01T00:00:00`));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function getShareForExpense(expense: Expense) {
  if (expense.split_type === "personal") {
    return { payer: expense.amount, partner: 0 };
  }

  if (expense.split_type === "custom") {
    const payerShare =
      typeof expense.custom_ratio === "number"
        ? expense.custom_ratio * expense.amount
        : expense.amount / 2;
    return { payer: payerShare, partner: expense.amount - payerShare };
  }

  return { payer: expense.amount / 2, partner: expense.amount / 2 };
}

/** How much a specific user is responsible for on this expense, after splits. */
export function getUserShareForExpense(expense: Expense, userId: string): number {
  const { payer, partner } = getShareForExpense(expense);
  // If this user paid, their share is the payer share.
  // If someone else paid, their share is the partner share.
  return expense.user_id === userId ? payer : partner;
}

export function calculateDashboardSummary({
  expenses,
  users,
  budgets,
  categories,
}: {
  expenses: DashboardExpenseWithCategory[];
  users: User[];
  budgets: Budget[];
  categories: Category[];
}): DashboardSummary {
  const userBalances = new Map<string, MemberBalance>();

  for (const user of users) {
    userBalances.set(user.id, {
      userId: user.id,
      name: user.name,
      paid: 0,
      owed: 0,
    });
  }

  let totalSpent = 0;
  let sharedSpent = 0;
  let personalSpent = 0;

  for (const expense of expenses) {
    totalSpent += expense.amount;

    const payer = userBalances.get(expense.user_id ?? "");
    if (payer) {
      payer.paid += expense.amount;
    }

    const { payer: payerShare, partner: partnerShare } =
      getShareForExpense(expense);

    if (expense.split_type === "personal") {
      personalSpent += expense.amount;
    } else {
      sharedSpent += expense.amount;
    }

    if (payer) {
      payer.owed += payerShare;
    }

    const otherUsers = users.filter((user) => user.id !== expense.user_id);
    const otherUser = otherUsers[0];

    if (otherUser) {
      const balance = userBalances.get(otherUser.id);
      if (balance) {
        balance.owed += partnerShare;
      }
    }
  }

  const members = Array.from(userBalances.values());
  const balanceA = members[0] ?? null;
  const balanceB = members[1] ?? null;

  const categoryTotals = new Map<string | null, number>();
  for (const expense of expenses) {
    const key = expense.category_id ?? null;
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + expense.amount);
  }

  const budgetMap = new Map<string, Budget>();
  for (const budget of budgets) {
    budgetMap.set(`${budget.category_id ?? "overall"}:${budget.month}`, budget);
  }

  const categorySummaries = Array.from(categoryTotals.entries())
    .map(([categoryId, amount]) => {
      const category = categories.find((item) => item.id === categoryId);
      const currentMonth = getCurrentMonthValue();
      const budget = budgetMap.get(
        `${categoryId ?? "overall"}:${currentMonth}-01`,
      );

      return {
        categoryId,
        name: category?.name ?? "Uncategorized",
        amount: roundCurrency(amount),
        budget: budget ? Number(budget.amount) : null,
        remaining: budget
          ? roundCurrency(Number(budget.amount) - amount)
          : null,
      };
    })
    .sort((left, right) => right.amount - left.amount);

  return {
    totalSpent: roundCurrency(totalSpent),
    sharedSpent: roundCurrency(sharedSpent),
    personalSpent: roundCurrency(personalSpent),
    balanceA,
    balanceB,
    categorySummaries,
  };
}

export function getGoalProgress(goal: SavingsGoal) {
  if (goal.target_amount <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((goal.current_amount / goal.target_amount) * 100),
  );
}

export function computeMonthlyTrends(
  expenses: Expense[],
): MonthlyTrend[] {
  const byMonth = new Map<string, { total: number; shared: number; personal: number }>();

  for (const expense of expenses) {
    const month = expense.expense_date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, { total: 0, shared: 0, personal: 0 });
    }
    const bucket = byMonth.get(month)!;
    bucket.total += Number(expense.amount);
    if (expense.split_type === "personal") {
      bucket.personal += Number(expense.amount);
    } else {
      bucket.shared += Number(expense.amount);
    }
  }

  return Array.from(byMonth.entries())
    .map(([month, val]) => ({
      month,
      label: formatShortMonthLabel(month),
      total: roundCurrency(val.total),
      sharedSpent: roundCurrency(val.shared),
      personalSpent: roundCurrency(val.personal),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function computeBalanceTimeline(
  expenses: Expense[],
  users: User[],
): BalancePoint[] {
  const byMonth = new Map<string, { payer: Map<string, number>; partner: Map<string, number> }>();

  for (const expense of expenses) {
    const month = expense.expense_date.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, { payer: new Map(), partner: new Map() });
    }
    const bucket = byMonth.get(month)!;
    const payerId = expense.user_id ?? "";
    const { payer: payerShare, partner: partnerShare } =
      getShareForExpense(expense);

    bucket.payer.set(payerId, (bucket.payer.get(payerId) ?? 0) + payerShare);
    const otherUsers = users.filter((u) => u.id !== payerId);
    if (otherUsers[0]) {
      const partnerId = otherUsers[0].id;
      bucket.partner.set(partnerId, (bucket.partner.get(partnerId) ?? 0) + partnerShare);
    }
  }

  const userA = users[0];
  const userB = users[1];

  if (!userA || !userB) return [];

  return Array.from(byMonth.entries())
    .map(([month, val]) => {
      const aPaid = roundCurrency(val.payer.get(userA.id) ?? 0);
      const bPaid = roundCurrency(val.payer.get(userB.id) ?? 0);
      const aOwedFromShared = roundCurrency(val.partner.get(userA.id) ?? 0);
      const bOwedFromShared = roundCurrency(val.partner.get(userB.id) ?? 0);
      const aNet = roundCurrency(aPaid - aOwedFromShared);
      const bNet = roundCurrency(bPaid - bOwedFromShared);

      return {
        month,
        label: formatShortMonthLabel(month),
        paidBy: { userId: userA.id, name: userA.name, amount: aPaid },
        paidByPartner: { userId: userB.id, name: userB.name, amount: bPaid },
        netBalance: roundCurrency(aNet - bNet),
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function detectStreaks(expenses: Expense[]): StreakInfo {
  const dates = [
    ...new Set(expenses.map((e) => e.expense_date)),
  ].sort((a, b) => a.localeCompare(b));

  if (dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalExpenses: expenses.length, firstExpenseDate: null, expenseDates: [] };
  }

  let longestStreak = 1;
  let currentRun = 1;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      currentRun++;
      longestStreak = Math.max(longestStreak, currentRun);
    } else if (diff > 1) {
      currentRun = 1;
    }
  }

  // Current streak: count from most recent date backwards
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = dates[dates.length - 1];
  const daysSinceLast = Math.round(
    (new Date(today).getTime() - new Date(lastDate).getTime()) /
      (1000 * 60 * 60 * 24),
  );

  let currentStreak = 0;
  if (daysSinceLast <= 1) {
    // The streak is active
    currentStreak = 1;
    for (let i = dates.length - 2; i >= 0; i--) {
      const curr = new Date(dates[i + 1]);
      const prev = new Date(dates[i]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalExpenses: expenses.length,
    firstExpenseDate: dates[0],
    expenseDates: dates,
  };
}

export function detectRecurringExpenses(
  expenses: Expense[],
  categories: Category[],
): RecurringExpense[] {
  const grouped = new Map<string, { amount: number; categoryId: string | null; months: Set<string>; description: string | null }>();

  for (const expense of expenses) {
    const key = `${expense.category_id ?? "null"}|${Math.round(Number(expense.amount) * 100)}`;
    const month = expense.expense_date.slice(0, 7);

    if (grouped.has(key)) {
      const entry = grouped.get(key)!;
      entry.months.add(month);
    } else {
      grouped.set(key, {
        amount: Number(expense.amount),
        categoryId: expense.category_id,
        months: new Set([month]),
        description: expense.description,
      });
    }
  }

  return Array.from(grouped.entries())
    .map(([, entry]) => {
      const category = entry.categoryId
        ? categories.find((c) => c.id === entry.categoryId)
        : null;
      return {
        categoryId: entry.categoryId,
        categoryName: category?.name ?? "Uncategorized",
        categoryIcon: category?.icon ?? null,
        amount: entry.amount,
        monthsAppeared: entry.months.size,
        months: Array.from(entry.months).sort(),
        description: entry.description,
      };
    })
    .filter((r) => r.monthsAppeared >= 2)
    .sort((a, b) => b.monthsAppeared - a.monthsAppeared)
    .slice(0, 5);
}

export function generateInsights(
  currentExpenses: DashboardExpenseWithCategory[],
  previousExpenses: DashboardExpenseWithCategory[],
  categories: Category[],
): SpendingInsight[] {
  const insights: SpendingInsight[] = [];

  // Per-category comparison
  const catCurrent = new Map<string | null, number>();
  const catPrevious = new Map<string | null, number>();

  for (const e of currentExpenses) {
    const key = e.category_id ?? null;
    catCurrent.set(key, (catCurrent.get(key) ?? 0) + Number(e.amount));
  }
  for (const e of previousExpenses) {
    const key = e.category_id ?? null;
    catPrevious.set(key, (catPrevious.get(key) ?? 0) + Number(e.amount));
  }

  const allKeys = new Set([...catCurrent.keys(), ...catPrevious.keys()]);
  for (const key of allKeys) {
    const curr = catCurrent.get(key) ?? 0;
    const prev = catPrevious.get(key) ?? 0;
    const category = key ? categories.find((c) => c.id === key) : null;

    if (prev > 0 && curr > 0) {
      const change = ((curr - prev) / prev) * 100;
      if (Math.abs(change) >= 15) {
        insights.push({
          type: change > 0 ? "increase" : "decrease",
          categoryName: category?.name ?? "Uncategorized",
          categoryIcon: category?.icon ?? null,
          currentAmount: roundCurrency(curr),
          previousAmount: roundCurrency(prev),
          percentChange: Math.round(change),
          message: change > 0
            ? `${Math.round(change)}% more on ${category?.name ?? "uncategorized"} this month`
            : `${Math.abs(Math.round(change))}% less on ${category?.name ?? "uncategorized"} this month`,
        });
      }
    } else if (prev === 0 && curr > 0) {
      insights.push({
        type: "new",
        categoryName: category?.name ?? "Uncategorized",
        categoryIcon: category?.icon ?? null,
        currentAmount: roundCurrency(curr),
        previousAmount: 0,
        percentChange: 100,
        message: `New spending on ${category?.name ?? "uncategorized"} — ${formatCurrency(curr)} this month`,
      });
    }
  }

  // Total comparison
  const currentTotal = currentExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const previousTotal = previousExpenses.reduce((s, e) => s + Number(e.amount), 0);
  if (previousTotal > 0 && currentTotal > 0) {
    const change = ((currentTotal - previousTotal) / previousTotal) * 100;
    if (Math.abs(change) >= 10) {
      insights.unshift({
        type: change > 0 ? "increase" : "decrease",
        categoryName: "Overall",
        categoryIcon: null,
        currentAmount: roundCurrency(currentTotal),
        previousAmount: roundCurrency(previousTotal),
        percentChange: Math.round(change),
        message: change > 0
          ? `Overall spending up ${Math.round(change)}% from last month`
          : `Overall spending down ${Math.abs(Math.round(change))}% from last month — keep it up!`,
      });
    }
  }

  return insights.slice(0, 4);
}

export function getSpendingPersonality(totalSpent: number, sharedRatio: number, personalRatio: number): string {
  const total = totalSpent;
  if (total === 0) return "Starting out";
  if (sharedRatio > 0.6) return "Team player";
  if (personalRatio > 0.6) return "Independent";
  if (total > 10000) return "High roller";
  if (total < 1000) return "Minimalist";
  return "Balanced";
}

export function computeCategoryHistory(
  expenses: Expense[],
  categoryId: string | null,
  months: string[],
): MonthlyHistory[] {
  const byMonth = new Map<string, number>();
  for (const expense of expenses) {
    if ((expense.category_id ?? null) !== categoryId) continue;
    const month = expense.expense_date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + Number(expense.amount));
  }
  return months.map((month) => ({
    month,
    label: formatShortMonthLabel(month),
    amount: roundCurrency(byMonth.get(month) ?? 0),
  }));
}

/** Escape a CSV field — wrap in quotes if it contains commas, quotes, or newlines. */
function csvEscape(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Generate a CSV string from expense rows for the given month. */
export function expensesToCsv(
  expenses: Array<{
    id: string;
    expense_date: string;
    description: string | null;
    category_name: string | null;
    amount: number;
    split_type: string;
    payer_name: string | null;
    my_share: number;
    partner_share: number;
    partner_name: string | null;
  }>,
): string {
  const header = ["Date", "Description", "Category", "Amount", "Split Type", "Paid By", "My Share", "Partner Share", "Partner"];
  const rows = expenses.map((e) => [
    e.expense_date,
    e.description ?? "",
    e.category_name ?? "Uncategorized",
    formatCurrency(e.amount),
    e.split_type,
    e.payer_name ?? "Unknown",
    formatCurrency(e.my_share),
    formatCurrency(e.partner_share),
    e.partner_name ?? "",
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

/** Generate a plain-text categories summary string. */
export function categoriesToText(
  rows: Array<{
    name: string;
    total: number;
    myShare: number;
    shared: number;
    personal: number;
    count: number;
  }>,
): string {
  const header = `${"Category".padEnd(20)} ${"Total".padEnd(14)} ${"My Share".padEnd(14)} ${"Shared".padEnd(14)} ${"Personal".padEnd(14)} Entries`;
  const sep = "─".repeat(header.length);
  const lines = rows.map((r) =>
    `${r.name.padEnd(20)} ${formatCurrency(r.total).padEnd(14)} ${formatCurrency(r.myShare).padEnd(14)} ${formatCurrency(r.shared).padEnd(14)} ${formatCurrency(r.personal).padEnd(14)} ${r.count}`,
  );
  return [header, sep, ...lines].join("\n");
}

// ─── Envelope Budgeting ──────────────────────────────────────────────────────

export type EnvelopeStatus = {
  budgetId: string;
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string | null;
  isShared: boolean;
  target: number;
  funded: number;
  spent: number;
  remaining: number;
  status: "funded" | "underfunded" | "overdrawn" | "on_track";
};

export function getEnvelopeStatus(
  target: number,
  funded: number,
  spent: number,
): EnvelopeStatus["status"] {
  if (funded <= 0 && spent <= 0) return "underfunded";
  if (spent > funded) return "overdrawn";
  if (funded < target) return "underfunded";
  return "funded";
}

export function computeReadyToAssign(
  totalIncome: number,
  totalFunded: number,
): number {
  return roundCurrency(totalIncome - totalFunded);
}

export function computeEnvelopeStatuses(
  budgets: Budget[],
  expenses: Expense[],
  categories: Category[],
  userId?: string,
): EnvelopeStatus[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Build two spending maps:
  //   gross — full expense amount (for shared envelopes)
  //   perUser — per-user share after splits (for individual envelopes)
  const grossByCategory = new Map<string | null, number>();
  const userByCategory = new Map<string | null, number>();
  let grossTotal = 0;
  let userTotal = 0;

  for (const expense of expenses) {
    const key = expense.category_id ?? null;
    const fullAmount = Number(expense.amount);
    const shareAmount = userId
      ? getUserShareForExpense(expense, userId)
      : fullAmount;

    grossByCategory.set(key, (grossByCategory.get(key) ?? 0) + fullAmount);
    grossTotal += fullAmount;

    userByCategory.set(key, (userByCategory.get(key) ?? 0) + shareAmount);
    userTotal += shareAmount;
  }

  return budgets.map((budget) => {
    const category = budget.category_id
      ? categoryById.get(budget.category_id)
      : null;

    // Shared envelopes track the full amount; individual envelopes track the user's share.
    const isEnvShared = budget.is_shared !== false;
    const spent =
      budget.category_id === null
        ? isEnvShared
          ? grossTotal
          : userTotal
        : isEnvShared
          ? grossByCategory.get(budget.category_id) ?? 0
          : userByCategory.get(budget.category_id) ?? 0;

    const funded = Number(budget.funded_amount) || 0;
    const target = Number(budget.amount);

    return {
      budgetId: budget.id,
      categoryId: budget.category_id ?? null,
      categoryName: category?.name ?? "Overall",
      categoryIcon: category?.icon ?? null,
      isShared: isEnvShared,
      target,
      funded,
      spent: roundCurrency(spent),
      remaining: roundCurrency(funded - spent),
      status: getEnvelopeStatus(target, funded, spent),
    };
  });
}

/** Compute total income for a month from income records. */
export function computeTotalIncome(income: Income[]): number {
  return income.reduce((sum, i) => sum + Number(i.amount), 0);
}

// ─── Net Worth Utilities ────────────────────────────────────────────

export type NetWorthSummary = {
  total: number;
  accountsTotal: number;
  stockValue: number;
  stockPnL: number;
  accountCount: number;
};

export type NetWorthTrendPoint = {
  date: string;
  total: number;
};

export function computeNetWorthTotal(
  accounts: NetWorthAccount[],
  latestBalances: Map<string, number>,
  fxRates?: Map<string, number>,
): number {
  let total = 0;

  for (const account of accounts) {
    if (!account.include_in_net_worth) continue;

    let balance: number;
    if (account.ticker && account.current_price && account.quantity) {
      // Stock account: current price × quantity
      balance = Number(account.current_price) * Number(account.quantity);
    } else if (latestBalances.has(account.id)) {
      // Bank/other: use latest manual snapshot
      balance = latestBalances.get(account.id) ?? 0;
    } else {
      continue;
    }

    total += toSgd(balance, account.currency, fxRates ?? new Map());
  }

  return total;
}

export function computeStockValue(
  accounts: NetWorthAccount[],
  fxRates?: Map<string, number>,
): number {
  const rates = fxRates ?? new Map();
  return accounts
    .filter((a) => a.include_in_net_worth && a.ticker && a.current_price && a.quantity)
    .reduce(
      (sum, a) =>
        sum +
        toSgd(
          Number(a.current_price!) * Number(a.quantity!),
          a.currency,
          rates,
        ),
      0,
    );
}

export function computeStockCost(
  accounts: NetWorthAccount[],
  fxRates?: Map<string, number>,
): number {
  const rates = fxRates ?? new Map();
  return accounts
    .filter((a) => a.include_in_net_worth && a.ticker && a.buy_price && a.quantity)
    .reduce(
      (sum, a) =>
        sum +
        toSgd(
          Number(a.buy_price!) * Number(a.quantity!),
          a.currency,
          rates,
        ),
      0,
    );
}

export function computeStockPnL(
  accounts: NetWorthAccount[],
  fxRates?: Map<string, number>,
): {
  pnl: number;
  pnlPercent: number;
} {
  const value = computeStockValue(accounts, fxRates);
  const cost = computeStockCost(accounts, fxRates);

  if (cost === 0) return { pnl: 0, pnlPercent: 0 };

  return {
    pnl: value - cost,
    pnlPercent: roundCurrency(((value - cost) / cost) * 100),
  };
}

/**
 * Compute a daily timeline of stock portfolio value from balance snapshots.
 * Only includes accounts with a ticker.  For each day, walks snapshot cursors
 * just like computeNetWorthHistory.  Stock accounts without any snapshots
 * contribute only today's current_price × quantity.
 *
 * Returns an array of { date, total } points sorted ascending.
 */
export function computeStockHistory(
  accounts: NetWorthAccount[],
  snapshots: AccountBalanceSnapshot[],
  fxRates?: Map<string, number>,
): NetWorthTrendPoint[] {
  const stockAccts = accounts.filter((a) => a.include_in_net_worth && a.ticker && a.quantity);
  if (stockAccts.length === 0) return [];

  const stockIds = new Set(stockAccts.map((a) => a.id));

  // Group snapshots by account, sorted
  const snapshotsByAccount = new Map<string, AccountBalanceSnapshot[]>();
  for (const s of snapshots) {
    if (!stockIds.has(s.account_id)) continue;
    const list = snapshotsByAccount.get(s.account_id) ?? [];
    list.push(s);
    snapshotsByAccount.set(s.account_id, list);
  }
  for (const [, list] of snapshotsByAccount) {
    list.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  }

  const today = new Date().toISOString().slice(0, 10);
  let earliestDate = today;

  for (const [, list] of snapshotsByAccount) {
    if (list.length > 0 && list[0].recorded_at < earliestDate) {
      earliestDate = list[0].recorded_at;
    }
  }
  for (const a of stockAccts) {
    if (a.created_at && a.created_at.slice(0, 10) < earliestDate) {
      earliestDate = a.created_at.slice(0, 10);
    }
  }

  // Stock accounts that have NO snapshots
  const stockWithSnapshots = new Set(snapshotsByAccount.keys());
  const stockWithoutHist = stockAccts.filter((a) => !stockWithSnapshots.has(a.id));

  const dayMs = 24 * 60 * 60 * 1000;
  const start = new Date(earliestDate);
  const end = new Date(today);
  const rates = fxRates ?? new Map();
  const points: NetWorthTrendPoint[] = [];

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const snapCursor = new Map<string, number>();
  for (const [acctId] of snapshotsByAccount) {
    snapCursor.set(acctId, 0);
  }

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + dayMs)) {
    const dateStr = d.toISOString().slice(0, 10);
    const isToday = dateStr === today;

    let snapshotSum = 0;
    for (const [acctId, list] of snapshotsByAccount) {
      let idx = snapCursor.get(acctId) ?? 0;
      while (idx < list.length && list[idx].recorded_at <= dateStr) {
        idx++;
      }
      if (idx > 0) {
        const matched = list[idx - 1];
        const account = accountById.get(acctId);
        if (account) {
          snapshotSum += toSgd(matched.balance, account.currency, rates);
        } else {
          snapshotSum += matched.balance;
        }
      }
      snapCursor.set(acctId, idx);
    }

    let currentSgd = 0;
    if (isToday) {
      for (const a of stockWithoutHist) {
        currentSgd += toSgd(
          Number(a.current_price ?? 0) * Number(a.quantity!),
          a.currency,
          rates,
        );
      }
    }

    const total = snapshotSum + currentSgd;
    if (snapshotSum > 0 || currentSgd > 0 || isToday) {
      points.push({ date: dateStr, total });
    }
  }

  if (points.length === 0 && stockAccts.length > 0) {
    const value = computeStockValue(stockAccts, fxRates);
    if (value > 0) {
      return [{ date: today, total: value }];
    }
  }

  return points;
}

/**
 * Compute a rich daily history of net worth across all accounts.
 * Builds a timeline from the earliest balance snapshot (or account creation)
 * to today.  Each day reflects the latest-known snapshot balance for every
 * account (bank, managed, or stock) that has one.
 *
 * Stock accounts that have NO balance snapshot at all are excluded from
 * historical points — they only contribute their current_price × quantity
 * value on today's date.  This prevents inflating the past with today's
 * stock portfolio value.
 *
 * Returns an array of { date, total } points sorted ascending.
 */
export function computeNetWorthHistory(
  accounts: NetWorthAccount[],
  snapshots: AccountBalanceSnapshot[],
  fxRates?: Map<string, number>,
): NetWorthTrendPoint[] {
  if (accounts.length === 0) return [];

  // 1. Group snapshots by account, sorted by date
  const snapshotsByAccount = new Map<string, AccountBalanceSnapshot[]>();
  for (const s of snapshots) {
    const list = snapshotsByAccount.get(s.account_id) ?? [];
    list.push(s);
    snapshotsByAccount.set(s.account_id, list);
  }
  for (const [, list] of snapshotsByAccount) {
    list.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  }

  // 2. Find the full date range
  const today = new Date().toISOString().slice(0, 10);
  let earliestDate = today;

  for (const [, list] of snapshotsByAccount) {
    if (list.length > 0 && list[0].recorded_at < earliestDate) {
      earliestDate = list[0].recorded_at;
    }
  }
  for (const a of accounts) {
    if (a.created_at && a.created_at.slice(0, 10) < earliestDate) {
      earliestDate = a.created_at.slice(0, 10);
    }
  }

  // 3. Identify stock accounts that have NO snapshot history at all
  const stockAcctsWithSnapshots = new Set<string>();
  for (const [acctId] of snapshotsByAccount) {
    const acct = accounts.find((a) => a.id === acctId);
    if (acct?.ticker) stockAcctsWithSnapshots.add(acctId);
  }
  const stockAcctsWithoutHistory = accounts.filter(
    (a) => a.ticker && a.current_price && a.quantity && !stockAcctsWithSnapshots.has(a.id),
  );

  // 4. Build a day-by-day timeline
  const dayMs = 24 * 60 * 60 * 1000;
  const start = new Date(earliestDate);
  const end = new Date(today);
  const rates = fxRates ?? new Map();
  const points: NetWorthTrendPoint[] = [];

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Per-account cursor into its snapshot list
  const snapCursor = new Map<string, number>();
  for (const [acctId] of snapshotsByAccount) {
    snapCursor.set(acctId, 0);
  }

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + dayMs)) {
    const dateStr = d.toISOString().slice(0, 10);
    const isToday = dateStr === today;

    // Advance snapshot cursors for this date
    let snapshotSum = 0;
    for (const [acctId, list] of snapshotsByAccount) {
      let idx = snapCursor.get(acctId) ?? 0;
      while (idx < list.length && list[idx].recorded_at <= dateStr) {
        idx++;
      }
      if (idx > 0) {
        const matched = list[idx - 1];
        const account = accountById.get(acctId);
        if (account) {
          snapshotSum += toSgd(matched.balance, account.currency, rates);
        } else {
          snapshotSum += matched.balance;
        }
      }
      snapCursor.set(acctId, idx);
    }

    // For today, also add current value of stock accounts without snapshots
    let stockCurrentSgd = 0;
    if (isToday) {
      for (const a of stockAcctsWithoutHistory) {
        stockCurrentSgd += toSgd(
          Number(a.current_price!) * Number(a.quantity!),
          a.currency,
          rates,
        );
      }
    }

    const total = snapshotSum + stockCurrentSgd;

    // Only emit points that have data (or today)
    if (snapshotSum > 0 || stockCurrentSgd > 0 || isToday) {
      points.push({ date: dateStr, total });
    }
  }

  // If we have zero points, fall back to a today-only entry
  if (points.length === 0) {
    const latestTotal = computeNetWorthTotal(accounts, new Map(), fxRates);
    if (latestTotal > 0) {
      return [{ date: today, total: latestTotal }];
    }
  }

  return points;
}

export function getStockAccounts(accounts: NetWorthAccount[]): NetWorthAccount[] {
  return accounts.filter((a) => a.ticker);
}

export function getNonStockAccounts(accounts: NetWorthAccount[]): NetWorthAccount[] {
  return accounts.filter((a) => !a.ticker);
}

export function getAccountsByCategory(
  accounts: NetWorthAccount[],
  category: AccountCategory,
): NetWorthAccount[] {
  return accounts.filter((a) => a.account_category === category);
}

export function computeCategoryTotal(
  accounts: NetWorthAccount[],
  category: AccountCategory,
  latestBalances: Map<string, number>,
  fxRates?: Map<string, number>,
): number {
  const rates = fxRates ?? new Map();
  return getAccountsByCategory(accounts, category).reduce((sum, a) => {
    if (!a.include_in_net_worth) return sum;
    let balance = 0;
    if (a.ticker && a.current_price && a.quantity) {
      balance = Number(a.current_price) * Number(a.quantity);
    } else {
      balance = latestBalances.get(a.id) ?? 0;
    }
    return sum + toSgd(balance, a.currency, rates);
  }, 0);
}

export function computeManagedPnL(
  account: NetWorthAccount,
  latestBalances: Map<string, number>,
  fxRates?: Map<string, number>,
): { pnl: number; pnlPercent: number } | null {
  if (account.account_category !== "managed") return null;
  const currentValue = latestBalances.get(account.id);
  const initial = account.initial_investment;
  if (currentValue == null || initial == null || initial === 0) return null;
  const rates = fxRates ?? new Map();
  const currentSgd = toSgd(currentValue, account.currency, rates);
  const initialSgd = toSgd(Number(initial), account.currency, rates);
  return {
    pnl: currentSgd - initialSgd,
    pnlPercent: roundCurrency(((currentSgd - initialSgd) / initialSgd) * 100),
  };
}

export function formatNetWorth(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getAccountBalanceLabel(account: NetWorthAccount): number | null {
  if (account.ticker && account.current_price && account.quantity) {
    return Number(account.current_price) * Number(account.quantity);
  }
  return null;
}
