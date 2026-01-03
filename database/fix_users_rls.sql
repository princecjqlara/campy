-- Fix RLS policies for users table to prevent 500 errors
-- Run this in Supabase SQL Editor

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users are viewable by authenticated users" ON users;
DROP POLICY IF EXISTS "Admins can manage users" ON users;
DROP POLICY IF EXISTS "Users can read their own profile" ON users;

-- Policy 1: Users can always read their own profile (no recursion)
CREATE POLICY "Users can read their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Policy 2: All authenticated users can read all user profiles
-- This is needed for the app to work, but we'll keep it simple
CREATE POLICY "Authenticated users can view all users" ON users
  FOR SELECT USING (auth.role() = 'authenticated');

-- Policy 3: Users can update their own profile (name, etc.)
CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 4: Admins can insert/update/delete any user
-- Use a function to check admin status to avoid recursion
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- Now use the function in the policy (avoids recursion)
CREATE POLICY "Admins can manage all users" ON users
  FOR ALL USING (is_admin());

-- Note: The is_admin() function uses SECURITY DEFINER, so it runs
-- with elevated privileges and can bypass RLS to check the user's role
-- without causing recursion.

