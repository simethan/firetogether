-- ============================================
-- Split groups (ported from SmartSplit)
-- Trips, houses and crews that split receipts item by item and settle up,
-- plus the bridge that feeds each member's share into their budget.
-- ============================================

CREATE TABLE IF NOT EXISTS split_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_currency TEXT NOT NULL DEFAULT 'SGD',
  password_hash TEXT,
  simplify_debts BOOLEAN NOT NULL DEFAULT true,
  convert_balances BOOLEAN NOT NULL DEFAULT true,
  reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_days INT NOT NULL DEFAULT 7 CHECK (reminder_days > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  legacy_source TEXT,
  legacy_id TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (legacy_source, legacy_id)
);

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  nickname TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  banned BOOLEAN NOT NULL DEFAULT false,
  removed_at TIMESTAMPTZ,
  sync_to_budget BOOLEAN NOT NULL DEFAULT true,
  legacy_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  paid_by_member_id UUID REFERENCES group_members(id) ON DELETE SET NULL,
  created_by_member_id UUID REFERENCES group_members(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('receipt', 'manual', 'recurring')),
  merchant TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_number TEXT,
  currency TEXT NOT NULL DEFAULT 'SGD',
  service_charge_percent DECIMAL(6,3),
  tax_percent DECIMAL(6,3),
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Miscellaneous',
  receipt_path TEXT,
  receipt_content_type TEXT,
  content_hash TEXT,
  parse_status TEXT NOT NULL DEFAULT 'manual'
    CHECK (parse_status IN ('pending_ocr', 'processing', 'parsed', 'verified', 'manual', 'failed')),
  parse_attempts INT NOT NULL DEFAULT 0,
  next_parse_at TIMESTAMPTZ,
  parse_note TEXT,
  ocr_raw_text TEXT,
  legacy_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (group_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_group_expenses_group_date ON group_expenses(group_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_group_expenses_parse ON group_expenses(parse_status, next_parse_at);

CREATE TABLE IF NOT EXISTS group_expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES group_expenses(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  -- Items can be paid by someone other than the receipt's payer (SmartSplit allows it).
  paid_by_member_id UUID REFERENCES group_members(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  category TEXT,
  split_method TEXT NOT NULL DEFAULT 'equal' CHECK (split_method IN ('equal', 'percentage', 'custom')),
  dispute_status TEXT NOT NULL DEFAULT 'none' CHECK (dispute_status IN ('none', 'open', 'resolved')),
  dispute_reason TEXT,
  disputed_by_member_id UUID REFERENCES group_members(id) ON DELETE SET NULL,
  disputed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_items_expense ON group_expense_items(expense_id);
CREATE INDEX IF NOT EXISTS idx_group_items_group ON group_expense_items(group_id);

-- share: weight for 'equal', percent for 'percentage', exact amount for 'custom'.
-- amount: cached result in the expense currency, including charges and discount.
CREATE TABLE IF NOT EXISTS item_assignments (
  item_id UUID NOT NULL REFERENCES group_expense_items(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  share DECIMAL(12,4) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (item_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_item_assignments_group ON item_assignments(group_id);

CREATE TABLE IF NOT EXISTS group_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  payer_member_id UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  receiver_member_id UUID NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  proof_path TEXT,
  recorded_by_member_id UUID REFERENCES group_members(id) ON DELETE SET NULL,
  approved_by_member_id UUID REFERENCES group_members(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  legacy_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (payer_member_id <> receiver_member_id)
);
CREATE INDEX IF NOT EXISTS idx_group_payments_group ON group_payments(group_id, created_at);

-- rate_to_base: 1 unit of `currency` = rate_to_base units of the group's base currency.
CREATE TABLE IF NOT EXISTS group_fx_rates (
  group_id UUID NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  rate_to_base DECIMAL(18,8) NOT NULL CHECK (rate_to_base > 0),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, currency)
);

CREATE TABLE IF NOT EXISTS group_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES group_expenses(id) ON DELETE CASCADE,
  member_id UUID REFERENCES group_members(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_comments_expense ON group_comments(expense_id, created_at);

CREATE TABLE IF NOT EXISTS group_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  member_id UUID REFERENCES group_members(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_activity_group ON group_activity(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS group_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES split_groups(id) ON DELETE CASCADE,
  category TEXT, -- NULL = whole group
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly', 'monthly', 'total')),
  alert_threshold INT NOT NULL DEFAULT 80 CHECK (alert_threshold BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Group recurring expenses reuse scheduled_transactions.
ALTER TABLE scheduled_transactions ALTER COLUMN couple_id DROP NOT NULL;
ALTER TABLE scheduled_transactions
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES split_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS group_paid_by_member_id UUID REFERENCES group_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_category TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE scheduled_transactions DROP CONSTRAINT IF EXISTS scheduled_transactions_owner_check;
ALTER TABLE scheduled_transactions
  ADD CONSTRAINT scheduled_transactions_owner_check CHECK (couple_id IS NOT NULL OR group_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_scheduled_group ON scheduled_transactions(group_id, next_date);

-- ============================================
-- Budget bridge
-- ============================================

CREATE TABLE IF NOT EXISTS group_category_map (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_category TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_category)
);

-- v0 bridge: one personal expense per member per group expense.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS group_expense_id UUID REFERENCES group_expenses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES split_groups(id) ON DELETE SET NULL;
-- Not partial: upserts need a plain unique index, and NULL group_expense_id rows never collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_group_expense_user
  ON expenses(group_expense_id, user_id);

-- IOU accounts: each member's net group balance shows up as a net worth account.
ALTER TABLE net_worth_accounts
  ADD COLUMN IF NOT EXISTS group_member_id UUID UNIQUE REFERENCES group_members(id) ON DELETE CASCADE;

-- ============================================
-- ROW LEVEL SECURITY
-- The app reads and writes through the service client after its own
-- membership checks; these policies cover direct client access.
-- ============================================

CREATE OR REPLACE FUNCTION is_group_member(target_group UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = target_group
      AND user_id = auth.uid()
      AND NOT banned
      AND removed_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION is_group_admin(target_group UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = target_group
      AND user_id = auth.uid()
      AND role = 'admin'
      AND NOT banned
      AND removed_at IS NULL
  )
$$;

ALTER TABLE split_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Split groups: members read" ON split_groups;
CREATE POLICY "Split groups: members read" ON split_groups
  FOR SELECT USING (is_group_member(id));
DROP POLICY IF EXISTS "Split groups: admins update" ON split_groups;
CREATE POLICY "Split groups: admins update" ON split_groups
  FOR UPDATE USING (is_group_admin(id));

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'group_members', 'group_expenses', 'group_expense_items', 'item_assignments',
    'group_payments', 'group_fx_rates', 'group_comments', 'group_activity', 'group_budgets'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s: members read" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s: members read" ON %I FOR SELECT USING (is_group_member(group_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s: members write" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "%s: members write" ON %I FOR ALL USING (is_group_member(group_id)) WITH CHECK (is_group_member(group_id))',
      t, t
    );
  END LOOP;
END $$;

ALTER TABLE group_category_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group category map: own rows" ON group_category_map;
CREATE POLICY "Group category map: own rows" ON group_category_map
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- STORAGE: private receipts bucket (served through signed URLs)
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;
