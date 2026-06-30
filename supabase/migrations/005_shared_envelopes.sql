-- Phase 1.5: Shared envelopes — allow budgets to be shared (couple-level)
-- or individual (per-user share)

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT true;

COMMENT ON COLUMN budgets.is_shared IS 'Shared envelopes track the full expense amount; individual envelopes track only the current user''s share after splits.';
