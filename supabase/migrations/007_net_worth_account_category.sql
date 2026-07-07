-- ============================================
-- Phase 2: Account categories & structured fields
-- Adds bank/investment/managed differentiation
-- ============================================

ALTER TABLE net_worth_accounts
  ADD COLUMN IF NOT EXISTS account_category TEXT NOT NULL DEFAULT 'bank'
    CHECK (account_category IN ('bank', 'investment', 'managed')),
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS broker TEXT,
  ADD COLUMN IF NOT EXISTS exchange TEXT,
  ADD COLUMN IF NOT EXISTS initial_investment DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS account_number TEXT;
