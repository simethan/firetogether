-- ============================================
-- FireTogether - Supabase Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE couples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  shortcut_token TEXT,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  category_id UUID REFERENCES categories(id),
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  split_type TEXT NOT NULL DEFAULT 'shared', -- 'personal', 'shared', 'custom'
  custom_ratio DECIMAL(3,2), -- e.g. 0.6 means payer paid 60%
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id), -- NULL = overall budget
  month DATE NOT NULL, -- format '2025-01-01'
  amount DECIMAL(10,2) NOT NULL,
  UNIQUE(couple_id, category_id, month)
);

CREATE TABLE savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  name TEXT NOT NULL,
  target_amount DECIMAL(10,2) NOT NULL,
  current_amount DECIMAL(10,2) DEFAULT 0,
  deadline DATE,
  is_shared BOOLEAN DEFAULT true,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_users_couple_id ON users(couple_id);
CREATE UNIQUE INDEX idx_users_shortcut_token ON users(shortcut_token);
CREATE INDEX idx_expenses_couple_id ON expenses(couple_id);
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_category_id ON expenses(category_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_categories_couple_id ON categories(couple_id);
CREATE INDEX idx_budgets_couple_id ON budgets(couple_id);
CREATE INDEX idx_savings_goals_couple_id ON savings_goals(couple_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables except couples
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

-- Helper function to get the couple_id for the current user
CREATE OR REPLACE FUNCTION auth_user_couple_id()
RETURNS UUID LANGUAGE sql STABLE AS
$$
  SELECT couple_id FROM users WHERE id = auth.uid()
$$;

-- Users: can only see/update users in their own couple
CREATE POLICY "Users can view own couple"
  ON users FOR SELECT
  USING (couple_id = auth_user_couple_id());

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- Categories: scoped to couple
CREATE POLICY "Categories: view own couple"
  ON categories FOR SELECT
  USING (couple_id = auth_user_couple_id());

CREATE POLICY "Categories: insert own couple"
  ON categories FOR INSERT
  WITH CHECK (couple_id = auth_user_couple_id());

CREATE POLICY "Categories: update own couple"
  ON categories FOR UPDATE
  USING (couple_id = auth_user_couple_id());

CREATE POLICY "Categories: delete own couple"
  ON categories FOR DELETE
  USING (couple_id = auth_user_couple_id());

-- Expenses: scoped to couple
CREATE POLICY "Expenses: view own couple"
  ON expenses FOR SELECT
  USING (couple_id = auth_user_couple_id());

CREATE POLICY "Expenses: insert own couple"
  ON expenses FOR INSERT
  WITH CHECK (couple_id = auth_user_couple_id());

CREATE POLICY "Expenses: update own couple"
  ON expenses FOR UPDATE
  USING (couple_id = auth_user_couple_id());

CREATE POLICY "Expenses: delete own couple"
  ON expenses FOR DELETE
  USING (couple_id = auth_user_couple_id());

-- Budgets: scoped to couple
CREATE POLICY "Budgets: view own couple"
  ON budgets FOR SELECT
  USING (couple_id = auth_user_couple_id());

CREATE POLICY "Budgets: insert own couple"
  ON budgets FOR INSERT
  WITH CHECK (couple_id = auth_user_couple_id());

CREATE POLICY "Budgets: update own couple"
  ON budgets FOR UPDATE
  USING (couple_id = auth_user_couple_id());

CREATE POLICY "Budgets: delete own couple"
  ON budgets FOR DELETE
  USING (couple_id = auth_user_couple_id());

-- Savings Goals: scoped to couple
CREATE POLICY "Goals: view own couple"
  ON savings_goals FOR SELECT
  USING (couple_id = auth_user_couple_id());

CREATE POLICY "Goals: insert own couple"
  ON savings_goals FOR INSERT
  WITH CHECK (couple_id = auth_user_couple_id());

CREATE POLICY "Goals: update own couple"
  ON savings_goals FOR UPDATE
  USING (couple_id = auth_user_couple_id());

CREATE POLICY "Goals: delete own couple"
  ON savings_goals FOR DELETE
  USING (couple_id = auth_user_couple_id());

-- ============================================
-- DEFAULT CATEGORIES TRIGGER
-- ============================================

-- When a couple is created, insert default categories
CREATE OR REPLACE FUNCTION insert_default_categories()
RETURNS TRIGGER LANGUAGE plpgsql AS
$$
BEGIN
  INSERT INTO categories (couple_id, name, icon, is_default) VALUES
    (NEW.id, 'Food & Dining', 'UtensilsCrossed', true),
    (NEW.id, 'Groceries', 'ShoppingCart', true),
    (NEW.id, 'Transport', 'Car', true),
    (NEW.id, 'Entertainment', 'Gamepad2', true),
    (NEW.id, 'Shopping', 'ShoppingBag', true),
    (NEW.id, 'Health', 'Heart', true),
    (NEW.id, 'Bills & Utilities', 'Receipt', true),
    (NEW.id, 'Housing', 'Home', true),
    (NEW.id, 'Travel', 'Plane', true),
    (NEW.id, 'Other', 'MoreHorizontal', true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_insert_default_categories
  AFTER INSERT ON couples
  FOR EACH ROW
  EXECUTE FUNCTION insert_default_categories();

-- ============================================
-- COUPLES RLS (read-only for linked users)
-- ============================================

ALTER TABLE couples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Couples: view own couple"
  ON couples FOR SELECT
  USING (id = auth_user_couple_id());
