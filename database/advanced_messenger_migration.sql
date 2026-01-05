-- Advanced Messenger Features Migration
-- Run this in Supabase SQL Editor

-- ============================================
-- CONVERSATION TAGS TABLE
-- Store tags that can be applied to conversations
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#a855f7',
  page_id TEXT REFERENCES facebook_pages(page_id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique tag names per page
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_tags_unique 
  ON conversation_tags(page_id, LOWER(name));

-- ============================================
-- CONVERSATION TAG ASSIGNMENTS
-- Link tags to conversations (many-to-many)
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_tag_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id TEXT NOT NULL REFERENCES facebook_conversations(conversation_id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES conversation_tags(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, tag_id)
);

-- ============================================
-- ADD COLUMNS TO EXISTING TABLES (safe to re-run)
-- ============================================

-- Add archived_at timestamp to track when archived
ALTER TABLE facebook_conversations 
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Add last_message_from_page to track who sent last message
ALTER TABLE facebook_conversations 
  ADD COLUMN IF NOT EXISTS last_message_from_page BOOLEAN DEFAULT false;

-- ============================================
-- BULK MESSAGE LOG TABLE
-- Track sent bulk messages
-- ============================================
CREATE TABLE IF NOT EXISTS bulk_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id TEXT REFERENCES facebook_pages(page_id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  attachment_url TEXT,
  filter_type TEXT NOT NULL, -- 'all', 'booked', 'unbooked', 'pipeline', 'not_pipeline', 'tag'
  filter_value TEXT, -- tag ID if filter_type = 'tag'
  recipients_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending, sending, completed, failed
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_messages ENABLE ROW LEVEL SECURITY;

-- Tags policies
CREATE POLICY "Tags viewable by authenticated users" ON conversation_tags
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage tags" ON conversation_tags
  FOR ALL USING (auth.role() = 'authenticated');

-- Tag assignments policies
CREATE POLICY "Tag assignments viewable by authenticated users" ON conversation_tag_assignments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage tag assignments" ON conversation_tag_assignments
  FOR ALL USING (auth.role() = 'authenticated');

-- Bulk messages policies
CREATE POLICY "Bulk messages viewable by authenticated users" ON bulk_messages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create bulk messages" ON bulk_messages
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage bulk messages" ON bulk_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_conversation_tags_page_id ON conversation_tags(page_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_conversation ON conversation_tag_assignments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag ON conversation_tag_assignments(tag_id);
CREATE INDEX IF NOT EXISTS idx_bulk_messages_page_id ON bulk_messages(page_id);
CREATE INDEX IF NOT EXISTS idx_bulk_messages_status ON bulk_messages(status);
