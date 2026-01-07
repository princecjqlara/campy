-- Add source column to clients table
-- Run this in Supabase SQL Editor

-- Add source column to track where the client came from
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Add facebook_page column to store associated page
ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_page TEXT;

-- Add niche column to store business niche
ALTER TABLE clients ADD COLUMN IF NOT EXISTS niche TEXT;

-- Add notes_media column for media attachments in notes
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes_media JSONB DEFAULT '[]';

-- Add index for source column
CREATE INDEX IF NOT EXISTS idx_clients_source ON clients(source);

-- Comment on columns
COMMENT ON COLUMN clients.source IS 'Source of the client: manual, facebook_messenger, booking, ai_detected';
COMMENT ON COLUMN clients.facebook_page IS 'Associated Facebook page URL';
COMMENT ON COLUMN clients.niche IS 'Business niche/industry';
