-- Add columns for intuition follow-up control

-- Column to disable intuition follow-ups per conversation (user can still use bot though)
ALTER TABLE facebook_conversations 
ADD COLUMN IF NOT EXISTS intuition_followup_disabled BOOLEAN DEFAULT false;

-- Column to indicate that a meeting/specific date was mentioned
ALTER TABLE facebook_conversations 
ADD COLUMN IF NOT EXISTS meeting_scheduled BOOLEAN DEFAULT false;

-- Comment for clarity
COMMENT ON COLUMN facebook_conversations.intuition_followup_disabled IS 'If true, AI will not proactively follow up, but will still respond to messages';
COMMENT ON COLUMN facebook_conversations.meeting_scheduled IS 'If true, customer mentioned a meeting time or date - stop intuition follow-ups';
