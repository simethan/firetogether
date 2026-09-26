export type SplitGroup = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  base_currency: string;
  password_hash: string | null;
  simplify_debts: boolean;
  convert_balances: boolean;
  reminders_enabled: boolean;
  reminder_days: number;
  status: "active" | "archived";
  created_by: string | null;
  created_at: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  user_id: string | null;
  nickname: string;
  role: "admin" | "member";
  banned: boolean;
  removed_at: string | null;
  sync_to_budget: boolean;
  created_at: string;
};

export type ParseStatus = "pending_ocr" | "processing" | "parsed" | "verified" | "manual" | "failed";

export type GroupExpense = {
  id: string;
  group_id: string;
  paid_by_member_id: string | null;
  created_by_member_id: string | null;
  kind: "receipt" | "manual" | "recurring";
  merchant: string | null;
  expense_date: string;
  receipt_number: string | null;
  currency: string;
  service_charge_percent: number | null;
  tax_percent: number | null;
  discount: number;
  total: number;
  category: string;
  receipt_path: string | null;
  receipt_content_type: string | null;
  content_hash: string | null;
  parse_status: ParseStatus;
  parse_attempts: number;
  next_parse_at: string | null;
  parse_note: string | null;
  created_at: string;
};

export type GroupExpenseItem = {
  id: string;
  expense_id: string;
  group_id: string;
  paid_by_member_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  category: string | null;
  split_method: "equal" | "percentage" | "custom";
  dispute_status: "none" | "open" | "resolved";
  dispute_reason: string | null;
  disputed_by_member_id: string | null;
  disputed_at: string | null;
  resolved_at: string | null;
  sort_order: number;
};

export type ItemAssignment = {
  item_id: string;
  member_id: string;
  group_id: string;
  share: number;
  amount: number;
};

export type GroupPayment = {
  id: string;
  group_id: string;
  payer_member_id: string;
  receiver_member_id: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  proof_path: string | null;
  recorded_by_member_id: string | null;
  approved_by_member_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type GroupFxRate = {
  group_id: string;
  currency: string;
  rate_to_base: number;
  locked_at: string;
};

export type GroupComment = {
  id: string;
  group_id: string;
  expense_id: string;
  member_id: string | null;
  body: string;
  created_at: string;
};

export type GroupActivity = {
  id: string;
  group_id: string;
  member_id: string | null;
  actor_name: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type GroupBudget = {
  id: string;
  group_id: string;
  category: string | null;
  amount: number;
  period: "weekly" | "monthly" | "total";
  alert_threshold: number;
  created_at: string;
};

export const GROUP_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Transport",
  "Accommodation",
  "Entertainment",
  "Shopping",
  "Travel",
  "Bills & Utilities",
  "Health",
  "Miscellaneous",
] as const;

/** Frankfurter's currency set (what SmartSplit supports) plus common travel currencies. */
export const SUPPORTED_CURRENCIES = [
  "SGD", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "HKD", "IDR", "INR",
  "KRW", "MYR", "NZD", "PHP", "THB", "TWD", "VND", "BRL", "CZK", "DKK", "HUF", "ILS",
  "ISK", "MXN", "NOK", "PLN", "RON", "SEK", "TRY", "ZAR",
] as const;
