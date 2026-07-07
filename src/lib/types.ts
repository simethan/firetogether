 export type Couple = {
  id: string;
  invite_code: string;
  created_at: string;
};

export type User = {
  id: string;
  couple_id: string | null;
  email: string;
  shortcut_token: string | null;
  name: string;
  created_at: string;
};

export type Category = {
  id: string;
  couple_id: string;
  name: string;
  icon: string | null;
  is_default: boolean;
  created_at: string;
};

export type Expense = {
  id: string;
  couple_id: string;
  user_id: string | null;
  category_id: string | null;
  payee_id: string | null;
  amount: number;
  description: string | null;
  expense_date: string;
  split_type: "personal" | "shared" | "custom";
  custom_ratio: number | null;
  created_at: string;
  // Joined
  categories?: Category;
  users?: User;
  payees?: Payee;
};

export type Budget = {
  id: string;
  couple_id: string;
  category_id: string | null;
  month: string;
  amount: number;
  funded_amount: number;
  is_shared: boolean;
  // Joined
  categories?: Category;
};

export type Income = {
  id: string;
  couple_id: string;
  user_id: string | null;
  amount: number;
  source: string;
  income_date: string;
  created_at: string;
  // Joined
  users?: User;
};

export type Payee = {
  id: string;
  couple_id: string;
  name: string;
  icon: string | null;
  created_at: string;
};

export type ScheduledTransaction = {
  id: string;
  couple_id: string;
  user_id: string | null;
  category_id: string | null;
  payee_id: string | null;
  amount: number;
  description: string | null;
  split_type: "personal" | "shared" | "custom";
  custom_ratio: number | null;
  frequency: "weekly" | "monthly" | "yearly";
  frequency_interval: number;
  next_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  // Joined
  categories?: Category;
  payees?: Payee;
  users?: User;
};

export type ExpenseFormState = {
  error: string | null;
};

export const initialExpenseFormState: ExpenseFormState = {
  error: null,
};

export type SavingsGoal = {
  id: string;
  couple_id: string;
  created_by: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  is_shared: boolean;
  icon: string | null;
  created_at: string;
};

type SplitType = "personal" | "shared" | "custom";

export type ShortcutExpensePayload = {
  amount: number;
  category_id?: string | null;
  category_name?: string | null;
  expense_date: string;
  description?: string;
  split_type: SplitType;
  custom_ratio?: number | null;
};

export type AccountCategory = "bank" | "investment" | "managed";

export type NetWorthAccount = {
  id: string;
  couple_id: string;
  name: string;
  type: string;
  icon: string | null;
  account_category: AccountCategory;
  bank_name: string | null;
  broker: string | null;
  exchange: string | null;
  initial_investment: number | null;
  account_number: string | null;
  ticker: string | null;
  quantity: number | null;
  buy_price: number | null;
  current_price: number | null;
  currency: string;
  last_price_fetched_at: string | null;
  include_in_net_worth: boolean;
  sort_order: number;
  created_at: string;
};

export type AccountBalanceSnapshot = {
  id: string;
  account_id: string;
  balance: number;
  recorded_at: string;
  notes: string | null;
  created_at: string;
};

export type Dividend = {
  id: string;
  account_id: string;
  amount: number;
  currency: string;
  pay_date: string;
  notes: string | null;
  created_at: string;
};
