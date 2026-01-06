-- User Shifts and Clock In/Out System
-- Run this in Supabase SQL Editor

-- ============================================
-- USER SHIFTS TABLE
-- Tracks clock in/out sessions for users
-- ============================================
CREATE TABLE IF NOT EXISTS user_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out TIMESTAMPTZ,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ADD COLUMNS TO USERS TABLE
-- ============================================
-- Online status tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_clocked_in BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_clock_in TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_shift_id UUID REFERENCES user_shifts(id);

-- ============================================
-- ADD AUTO-ASSIGN SETTINGS
-- ============================================
INSERT INTO facebook_settings (setting_key, setting_value) VALUES
  ('auto_assign_enabled', '{"enabled": false}'),
  ('round_robin_state', '{"last_assigned_index": 0, "last_assigned_user_id": null}')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_shifts_user_id ON user_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_shifts_clock_in ON user_shifts(clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_users_clocked_in ON users(is_clocked_in) WHERE is_clocked_in = true;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE user_shifts ENABLE ROW LEVEL SECURITY;

-- Users can view their own shifts
CREATE POLICY "Users can view own shifts" ON user_shifts
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own shifts
CREATE POLICY "Users can create own shifts" ON user_shifts
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own shifts (for clock out)
CREATE POLICY "Users can update own shifts" ON user_shifts
  FOR UPDATE USING (user_id = auth.uid());

-- Admins can view all shifts
CREATE POLICY "Admins can view all shifts" ON user_shifts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'organizer'))
  );

-- ============================================
-- REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE user_shifts;
