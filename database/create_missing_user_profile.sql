-- Create user profile for existing auth user
-- Run this in Supabase SQL Editor
-- Replace the UUID and email with your actual values

-- Get your user ID from Supabase Dashboard -> Authentication -> Users
-- Or use this query to find it:
-- SELECT id, email FROM auth.users WHERE email = 'aresmedia2026@gmail.com';

-- Then insert the profile (replace UUID_HERE with your actual user ID):
INSERT INTO users (id, email, name, role)
VALUES (
  '9a5eea28-a236-41d1-baf1-ec2d5aa1ad75'::UUID,  -- Replace with your actual user ID
  'aresmedia2026@gmail.com',
  'Admin Ares',
  'admin'  -- Set to 'admin' for admin access
)
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  email = 'aresmedia2026@gmail.com',
  name = 'Admin Ares';

-- Or if you want to create it for any user that's missing:
-- This will create profiles for all auth users that don't have profiles yet
INSERT INTO users (id, email, name, role)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'name', au.email),
  CASE 
    WHEN au.email = 'aresmedia2026@gmail.com' THEN 'admin'
    WHEN au.email = 'cjlara032107@gmail.com' THEN 'admin'
    ELSE 'user'
  END
FROM auth.users au
LEFT JOIN users u ON au.id = u.id
WHERE u.id IS NULL
ON CONFLICT (id) DO NOTHING;

