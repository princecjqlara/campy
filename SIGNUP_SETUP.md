# Setting Up User Sign-Up

## Step 1: Run the Database Trigger

To allow automatic user profile creation when users sign up, run this SQL in your Supabase SQL Editor:

```sql
-- Function to automatically create user profile when auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'user' -- Default role is 'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires when a new auth user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT INSERT ON public.users TO authenticated;
```

This trigger will automatically:
- Create a user profile in the `users` table when someone signs up
- Set the default role to 'user'
- Use the name from the sign-up form, or fall back to email if not provided

## Step 2: Configure Supabase Auth Settings

1. Go to Supabase Dashboard → Authentication → Settings
2. Make sure **"Enable email confirmations"** is configured as needed:
   - If enabled: Users must confirm email before logging in
   - If disabled: Users can log in immediately after sign-up

3. Under **"Auth Providers"**, ensure **Email** is enabled

## Step 3: Test Sign-Up

1. Open the application
2. Click "Sign Up" tab in the login modal
3. Enter:
   - Full Name
   - Email
   - Password (at least 6 characters)
4. Click "Create Account"
5. If email confirmation is enabled, check your email and confirm
6. Log in with your new account

## How It Works

1. User fills out sign-up form
2. Supabase Auth creates the auth user
3. Database trigger automatically creates user profile with 'user' role
4. User can log in (after email confirmation if enabled)

## Default User Role

All new sign-ups are automatically assigned the 'user' role. Only admins can:
- Access admin settings
- View expense statistics
- Manage package expenses

To promote a user to admin, use the admin setup tools or update directly in the database.

