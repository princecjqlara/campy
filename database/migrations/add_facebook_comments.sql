-- Facebook Comments tracking table (optional)
-- Used to track auto-replied comments and analytics

CREATE TABLE IF NOT EXISTS facebook_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id TEXT UNIQUE NOT NULL,
    post_id TEXT,
    page_id TEXT REFERENCES facebook_pages(page_id),
    commenter_id TEXT NOT NULL,
    commenter_name TEXT,
    comment_text TEXT,
    is_interested BOOLEAN DEFAULT false,
    auto_replied BOOLEAN DEFAULT false,
    dm_sent BOOLEAN DEFAULT false,
    reply_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by page
CREATE INDEX IF NOT EXISTS idx_fb_comments_page ON facebook_comments(page_id);
CREATE INDEX IF NOT EXISTS idx_fb_comments_created ON facebook_comments(created_at DESC);

-- Add source column to conversations to track origin (message, comment, etc.)
ALTER TABLE facebook_conversations 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'message';

-- Row level security
ALTER TABLE facebook_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by authenticated users" ON facebook_comments
    FOR SELECT USING (true);

CREATE POLICY "Comments insertable by authenticated users" ON facebook_comments
    FOR INSERT WITH CHECK (true);
