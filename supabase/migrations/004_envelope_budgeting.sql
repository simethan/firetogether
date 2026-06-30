-- ============================================
-- Phase 1: Envelope Budgeting & Financial Depth
-- Income, envelopes, payees, scheduled transactions
-- ============================================

-- F1: Income tracking
CREATE TABLE income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id),
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL,
  income_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_income_couple_id ON income(couple_id);
CREATE INDEX IF NOT EXISTS idx_income_date ON income(income_date);

ALTER TABLE income ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Income: view own couple" ON income;
CREATE POLICY "Income: view own couple" ON income FOR SELECT
  USING (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Income: insert own couple" ON income;
CREATE POLICY "Income: insert own couple" ON income FOR INSERT
  WITH CHECK (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Income: update own couple" ON income;
CREATE POLICY "Income: update own couple" ON income FOR UPDATE
  USING (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Income: delete own couple" ON income;
CREATE POLICY "Income: delete own couple" ON income FOR DELETE
  USING (couple_id = auth_user_couple_id());

-- F2: Add funded_amount to budgets
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS funded_amount DECIMAL(10,2) DEFAULT 0;

-- F4: Payees
CREATE TABLE IF NOT EXISTS payees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(couple_id, name)
);

CREATE INDEX IF NOT EXISTS idx_payees_couple_id ON payees(couple_id);

ALTER TABLE payees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payees: view own couple" ON payees;
CREATE POLICY "Payees: view own couple" ON payees FOR SELECT
  USING (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Payees: insert own couple" ON payees;
CREATE POLICY "Payees: insert own couple" ON payees FOR INSERT
  WITH CHECK (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Payees: update own couple" ON payees;
CREATE POLICY "Payees: update own couple" ON payees FOR UPDATE
  USING (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Payees: delete own couple" ON payees;
CREATE POLICY "Payees: delete own couple" ON payees FOR DELETE
  USING (couple_id = auth_user_couple_id());

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payee_id UUID REFERENCES payees(id);
CREATE INDEX IF NOT EXISTS idx_expenses_payee_id ON expenses(payee_id);

-- F5: Scheduled transactions
CREATE TABLE IF NOT EXISTS scheduled_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id),
  category_id UUID REFERENCES categories(id),
  payee_id UUID REFERENCES payees(id),
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  split_type TEXT NOT NULL DEFAULT 'shared',
  custom_ratio DECIMAL(3,2),
  frequency TEXT NOT NULL DEFAULT 'monthly',
  frequency_interval INT DEFAULT 1,
  next_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_couple_id ON scheduled_transactions(couple_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_next_date ON scheduled_transactions(next_date);

ALTER TABLE scheduled_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Scheduled: view own couple" ON scheduled_transactions;
CREATE POLICY "Scheduled: view own couple" ON scheduled_transactions FOR SELECT
  USING (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Scheduled: insert own couple" ON scheduled_transactions;
CREATE POLICY "Scheduled: insert own couple" ON scheduled_transactions FOR INSERT
  WITH CHECK (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Scheduled: update own couple" ON scheduled_transactions;
CREATE POLICY "Scheduled: update own couple" ON scheduled_transactions FOR UPDATE
  USING (couple_id = auth_user_couple_id());

DROP POLICY IF EXISTS "Scheduled: delete own couple" ON scheduled_transactions;
CREATE POLICY "Scheduled: delete own couple" ON scheduled_transactions FOR DELETE
  USING (couple_id = auth_user_couple_id());
