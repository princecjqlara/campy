-- Function to create admin user profile (bypasses RLS)
-- Run this in Supabase SQL Editor first

CREATE OR REPLACE FUNCTION create_admin_profile(
  user_id UUID,
  user_email TEXT,
  user_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO users (id, email, name, role)
  VALUES (user_id, user_email, user_name, 'admin')
  ON CONFLICT (email) 
  DO UPDATE SET 
    role = 'admin',
    name = user_name,
    id = user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_admin_profile(UUID, TEXT, TEXT) TO authenticated;

