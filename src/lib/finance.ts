import type { Budget, Category, Expense, SavingsGoal, User } from "@/lib/types";

export type DashboardExpenseWithCategory = Expense & {
  categories?: Category | null;
  users?: User | null;
};

export type MemberBalance = {
  userId: string;
  name: string;
  paid: number;
  owed: number;
  net: number;
};

export type CategorySummary = {
  categoryId: string | null;
  name: string;
  amount: number;
  budget: number | null;
  remaining: number | null;
};

export type DashboardSummary = {
  totalSpent: number;
  sharedSpent: number;
  personalSpent: number;
  balanceA: MemberBalance | null;
  balanceB: MemberBalance | null;
  settleUpAmount: number;
  categorySummaries: CategorySummary[];
};

export function getCurrentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

export function getMonthStartDate(monthValue: string) {
  return `${monthValue}-01`;
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function getShareForExpense(expense: Expense) {
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
      net: 0,
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
      payer.net += expense.amount - payerShare;
    }

    const otherUsers = users.filter((user) => user.id !== expense.user_id);
    const otherUser = otherUsers[0];

    if (otherUser) {
      const balance = userBalances.get(otherUser.id);
      if (balance) {
        balance.owed += partnerShare;
        balance.net -= partnerShare;
      }
    }
  }

  const members = Array.from(userBalances.values()).sort(
    (left, right) => right.net - left.net,
  );
  const balanceA = members[0] ?? null;
  const balanceB = members[1] ?? null;
  const settleUpAmount =
    balanceA && balanceB ? roundCurrency(Math.abs(balanceA.net)) : 0;

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
      const budget = budgetMap.get(
        `${categoryId ?? "overall"}:${new Date().toISOString().slice(0, 7)}-01`,
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
    settleUpAmount: roundCurrency(settleUpAmount),
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
