-- Add chat_support role to the users table check constraint
-- Run this in Supabase SQL Editor

-- First, drop the existing constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Then, add the updated constraint that includes chat_support
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('user', 'admin', 'chat_support'));

-- If the above doesn't work because the constraint has a different name, try:
-- 1. Find the constraint name:
--    SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c';
-- 
-- 2. Then drop it by that name:
--    ALTER TABLE users DROP CONSTRAINT [constraint_name];
--
-- 3. And add the new one:
--    ALTER TABLE users ADD CONSTRAINT users_role_check 
--      CHECK (role IN ('user', 'admin', 'chat_support'));
