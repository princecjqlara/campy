-- Create Admin Account: aresmedia2026@gmail.com
-- Run this in Supabase SQL Editor AFTER creating the auth user in Supabase Dashboard

-- First, you need to create the auth user in Supabase Dashboard -> Authentication
-- Then get the user's UUID from the auth.users table or from the auth response
-- Finally, run this SQL to create/update the user profile with admin role

-- Option 1: If you know the user's UUID (from auth.users table)
-- Replace 'USER_UUID_HERE' with the actual UUID from auth.users
/*
INSERT INTO users (id, email, name, role) VALUES
  ('USER_UUID_HERE', 'aresmedia2026@gmail.com', 'Admin Ares', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';
*/

-- Option 2: Use email to find and update (if user already exists in auth)
-- This will work if the user was created via signUp and the profile was auto-created
UPDATE users 
SET role = 'admin', name = 'Admin Ares'
WHERE email = 'aresmedia2026@gmail.com';

-- If the user doesn't exist in the users table yet, you'll need to:
-- 1. Create auth user in Supabase Dashboard -> Authentication -> Add User
--    Email: aresmedia2026@gmail.com
--    Password: AresMedia_26
--    Auto Confirm: Yes (to skip email verification)
-- 2. Get the UUID from the created user
-- 3. Run the INSERT statement above with that UUID

-- Or use the admin_setup.html page which handles this automatically

