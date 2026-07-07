-- Composite indexes for the dominant access pattern:
--   WHERE couple_id = ? AND <date> BETWEEN ...
-- Single-column (couple_id) indexes already exist; these composites let
-- Postgres satisfy both the filter and the date ordering from one index.

CREATE INDEX IF NOT EXISTS expenses_couple_date_idx
  ON expenses (couple_id, expense_date);

CREATE INDEX IF NOT EXISTS income_couple_date_idx
  ON income (couple_id, income_date);

CREATE INDEX IF NOT EXISTS budgets_couple_month_idx
  ON budgets (couple_id, month);

CREATE INDEX IF NOT EXISTS scheduled_couple_next_date_idx
  ON scheduled_transactions (couple_id, next_date);

-- Net-worth snapshot lookups are scoped by account_id and ordered by date.
CREATE INDEX IF NOT EXISTS account_balance_history_account_date_idx
  ON account_balance_history (account_id, recorded_at);

CREATE INDEX IF NOT EXISTS dividends_account_date_idx
  ON dividends (account_id, pay_date);
