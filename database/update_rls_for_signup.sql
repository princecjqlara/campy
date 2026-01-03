-- Update RLS policies to allow users to create their own profile
-- This works in conjunction with the trigger that auto-creates profiles
-- Run this in Supabase SQL Editor

-- Allow users to insert their own profile (via trigger)
-- The trigger uses SECURITY DEFINER, so it bypasses RLS
-- But we should also allow users to read their own profile
CREATE POLICY "Users can read their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Keep the existing policy for viewing all users
DROP POLICY IF EXISTS "Users are viewable by authenticated users" ON users;
CREATE POLICY "Users are viewable by authenticated users" ON users
  FOR SELECT USING (auth.role() = 'authenticated');

-- Keep admin management policy
DROP POLICY IF EXISTS "Admins can manage users" ON users;
CREATE POLICY "Admins can manage users" ON users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Note: The trigger function handle_new_user() uses SECURITY DEFINER
-- which means it runs with the privileges of the function creator
-- and can bypass RLS to insert the user profile

