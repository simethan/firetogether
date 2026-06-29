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
  amount: number;
  description: string | null;
  expense_date: string;
  split_type: "personal" | "shared" | "custom";
  custom_ratio: number | null;
  created_at: string;
  // Joined
  categories?: Category;
  users?: User;
};

export type Budget = {
  id: string;
  couple_id: string;
  category_id: string | null;
  month: string;
  amount: number;
  // Joined
  categories?: Category;
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
