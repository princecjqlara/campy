-- Tags Management Migration
-- Run this in Supabase SQL Editor to enable tag management

-- ============================================
-- TAGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(20) DEFAULT '#a3e635',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- Enable RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tags
-- All authenticated users can read tags
CREATE POLICY "Authenticated users can view tags" ON tags
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can create/update/delete tags
CREATE POLICY "Admins can manage tags" ON tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION update_tags_updated_at();

-- ============================================
-- UPDATE CLIENTS TABLE PHASE CONSTRAINT
-- ============================================
-- Update the phase constraint to remove 'proposal-sent' and add 'follow-up'
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_phase_check;

ALTER TABLE clients ADD CONSTRAINT clients_phase_check 
  CHECK (phase IN ('booked', 'follow-up', 'preparing', 'testing', 'running'));

-- Update default phase
ALTER TABLE clients ALTER COLUMN phase SET DEFAULT 'booked';

-- Migrate existing 'proposal-sent' clients to 'booked'
UPDATE clients SET phase = 'booked' WHERE phase = 'proposal-sent';

