-- ============================================
-- Phase 2: Net Worth Tracking
-- Accounts, balance snapshots, dividends
-- ============================================

-- NW1: Net worth accounts (any asset type)
CREATE TABLE IF NOT EXISTS net_worth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Bank',
  icon TEXT,
  ticker TEXT,
  quantity DECIMAL(12,4),
  buy_price DECIMAL(12,2),
  current_price DECIMAL(12,2),
  currency TEXT NOT NULL DEFAULT 'SGD',
  last_price_fetched_at TIMESTAMPTZ,
  include_in_net_worth BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_net_worth_accounts_couple_id ON net_worth_accounts(couple_id);

ALTER TABLE net_worth_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Net worth accounts: view own couple" ON net_worth_accounts;
CREATE POLICY "Net worth accounts: view own couple" ON net_worth_accounts
  FOR SELECT USING (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Net worth accounts: insert own couple" ON net_worth_accounts;
CREATE POLICY "Net worth accounts: insert own couple" ON net_worth_accounts
  FOR INSERT WITH CHECK (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Net worth accounts: update own couple" ON net_worth_accounts;
CREATE POLICY "Net worth accounts: update own couple" ON net_worth_accounts
  FOR UPDATE USING (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Net worth accounts: delete own couple" ON net_worth_accounts;
CREATE POLICY "Net worth accounts: delete own couple" ON net_worth_accounts
  FOR DELETE USING (couple_id = auth_user_couple_id());

-- NW2: Balance snapshots (for historical charting)
CREATE TABLE IF NOT EXISTS account_balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES net_worth_accounts(id) ON DELETE CASCADE NOT NULL,
  balance DECIMAL(14,2) NOT NULL,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_history_account ON account_balance_history(account_id);
CREATE INDEX IF NOT EXISTS idx_balance_history_date ON account_balance_history(recorded_at);

ALTER TABLE account_balance_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Balance history: view own couple" ON account_balance_history;
CREATE POLICY "Balance history: view own couple" ON account_balance_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM net_worth_accounts
      WHERE net_worth_accounts.id = account_balance_history.account_id
      AND net_worth_accounts.couple_id = auth_user_couple_id()
    )
  );

DROP POLICY IF EXISTS "Balance history: insert own couple" ON account_balance_history;
CREATE POLICY "Balance history: insert own couple" ON account_balance_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM net_worth_accounts
      WHERE net_worth_accounts.id = account_balance_history.account_id
      AND net_worth_accounts.couple_id = auth_user_couple_id()
    )
  );

DROP POLICY IF EXISTS "Balance history: delete own couple" ON account_balance_history;
CREATE POLICY "Balance history: delete own couple" ON account_balance_history
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM net_worth_accounts
      WHERE net_worth_accounts.id = account_balance_history.account_id
      AND net_worth_accounts.couple_id = auth_user_couple_id()
    )
  );

-- NW3: Dividends
CREATE TABLE IF NOT EXISTS dividends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES net_worth_accounts(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'SGD',
  pay_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dividends_account ON dividends(account_id);
CREATE INDEX IF NOT EXISTS idx_dividends_pay_date ON dividends(pay_date);

ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dividends: view own couple" ON dividends;
CREATE POLICY "Dividends: view own couple" ON dividends
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM net_worth_accounts
      WHERE net_worth_accounts.id = dividends.account_id
      AND net_worth_accounts.couple_id = auth_user_couple_id()
    )
  );

DROP POLICY IF EXISTS "Dividends: insert own couple" ON dividends;
CREATE POLICY "Dividends: insert own couple" ON dividends
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM net_worth_accounts
      WHERE net_worth_accounts.id = dividends.account_id
      AND net_worth_accounts.couple_id = auth_user_couple_id()
    )
  );

DROP POLICY IF EXISTS "Dividends: delete own couple" ON dividends;
CREATE POLICY "Dividends: delete own couple" ON dividends
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM net_worth_accounts
      WHERE net_worth_accounts.id = dividends.account_id
      AND net_worth_accounts.couple_id = auth_user_couple_id()
    )
  );
