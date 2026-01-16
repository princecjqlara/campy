-- Add reminder tracking columns to calendar_events table
-- This enables automated 24h and 1h reminders for AI-booked meetings

-- Add reminder tracking columns
ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false;

ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT false;

-- Add contact info for sending Messenger reminders
ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS contact_psid TEXT;

ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS conversation_id TEXT;

-- Add index for efficient reminder queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_reminders 
ON calendar_events(start_time, reminder_24h_sent, reminder_1h_sent) 
WHERE status = 'scheduled';

COMMENT ON COLUMN calendar_events.reminder_24h_sent IS 'Whether 24h reminder was sent';
COMMENT ON COLUMN calendar_events.reminder_1h_sent IS 'Whether 1h reminder was sent';
COMMENT ON COLUMN calendar_events.contact_psid IS 'Facebook PSID for sending Messenger reminders';
COMMENT ON COLUMN calendar_events.conversation_id IS 'Link to facebook_conversations for context';
