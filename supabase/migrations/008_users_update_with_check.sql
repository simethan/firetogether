-- Close the privilege-escalation gap in the "Users can update own profile"
-- policy. Previously it only had USING (id = auth.uid()) with no WITH CHECK,
-- so an authenticated user could UPDATE their own row's couple_id to another
-- couple and then read/write that couple's data through the app's service
-- client (which trusts couple_id from the users row).
DROP POLICY IF EXISTS "Users can update own profile" ON users;

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND couple_id = auth_user_couple_id());
