-- Add Lead Status to Facebook Conversations
-- Run this in Supabase SQL Editor

-- Add lead_status column with default 'intake'
ALTER TABLE facebook_conversations 
ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'intake';

-- Add check constraint for valid statuses
ALTER TABLE facebook_conversations 
DROP CONSTRAINT IF EXISTS facebook_conversations_lead_status_check;

ALTER TABLE facebook_conversations 
ADD CONSTRAINT facebook_conversations_lead_status_check 
CHECK (lead_status IN ('intake', 'qualified', 'unqualified', 'appointment_booked', 'converted'));

-- Create index for filtering by status
CREATE INDEX IF NOT EXISTS idx_fb_conversations_lead_status ON facebook_conversations(lead_status);

-- Update existing conversations to 'intake' if null
UPDATE facebook_conversations 
SET lead_status = 'intake' 
WHERE lead_status IS NULL;
