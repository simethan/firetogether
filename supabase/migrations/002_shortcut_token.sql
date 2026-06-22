-- ============================================
-- FireTogether - Shortcut token migration
-- Run this after 001_initial_schema.sql on existing databases
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS shortcut_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_shortcut_token ON users(shortcut_token);