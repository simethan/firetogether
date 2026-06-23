-- ============================================
-- QUICK FIX: Drop the broken trigger
-- This will immediately unblock auth user creation.
-- After running this, auth will work again.
-- The app code will handle creating public.users rows.
--
-- RUN THIS IN SUPABASE SQL EDITOR:
-- https://supabase.com/dashboard/project/inbcltbemsvivlnvjfcw/sql
-- ============================================

-- Drop the trigger that's breaking auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Also drop the function (optional, keeps things clean)
DROP FUNCTION IF EXISTS public.handle_new_auth_user();
