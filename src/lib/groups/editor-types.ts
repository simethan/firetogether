import type { SplitMethod } from "@/lib/splitting";

export type EditorItem = {
  id?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  category: string | null;
  splitMethod: SplitMethod;
  /** memberId → share (weight, percent, or exact amount depending on splitMethod) */
  shares: Record<string, number>;
};

export type SaveExpenseInput = {
  code: string;
  expenseId: string;
  merchant: string;
  date: string;
  currency: string;
  category: string;
  paidByMemberId: string;
  serviceChargePercent: number | null;
  taxPercent: number | null;
  discount: number;
  items: EditorItem[];
  markVerified: boolean;
};

export type SaveExpenseResult = { ok: true } | { ok: false; error: string };
