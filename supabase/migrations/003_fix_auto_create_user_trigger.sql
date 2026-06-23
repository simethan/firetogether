-- ============================================
-- FIX: Auto-create user trigger
-- The original trigger (002_auto_create_user.sql) fails because:
-- 1. RLS policy "Users can insert own profile" has WITH CHECK (id = auth.uid())
-- 2. During trigger execution, auth.uid() may not be set yet
-- 3. SECURITY DEFINER does NOT bypass RLS in Supabase unless the function owner has BYPASSRLS
--
-- This migration:
-- 1. Drops the old trigger
-- 2. Recreates the function with ALTER FUNCTION ... SECURITY DEFINER
-- 3. Adds an RLS policy that allows the postgres role (trigger owner) to insert
-- 4. Recreates the trigger
--
-- RUN THIS IN SUPABASE SQL EDITOR:
-- https://supabase.com/dashboard/project/inbcltbemsvivlnvjfcw/sql
-- ============================================

-- Step 1: Drop the existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 2: Recreate the function - same logic but we'll handle RLS below
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, couple_id, shortcut_token)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NULL,
    encode(gen_random_bytes(16), 'hex')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Step 3: Add an RLS policy that allows the trigger function to insert
-- The trigger function runs as the postgres user (SECURITY DEFINER).
-- We need a policy that allows inserts from the postgres role.
-- The simplest approach: add a policy that allows service_role to insert,
-- OR disable RLS temporarily for the trigger to work.
--
-- Best approach: Add a policy specifically for the trigger.
-- Since the function is SECURITY DEFINER owned by postgres,
-- and postgres has BYPASSRLS in Supabase, the function SHOULD bypass RLS.
--
-- BUT: In Supabase, the auth schema triggers run as the supabase_auth_admin role,
-- NOT as postgres. So SECURITY DEFINER runs as the function owner (postgres),
-- but the function owner in Supabase cloud might be supabase_admin or postgres.
--
-- The SAFEST fix: Temporarily disable RLS on public.users for the trigger,
-- or add a policy that allows the trigger's role.
--
-- Let's add a permissive INSERT policy for the trigger:
CREATE POLICY "Trigger can insert new users"
  ON users FOR INSERT
  TO postgres, supabase_admin
  WITH CHECK (true);

-- Step 4: Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
