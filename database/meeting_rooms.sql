-- Migration: Meeting Rooms with Live Captions
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Meeting Rooms Table
-- ============================================
CREATE TABLE IF NOT EXISTS meeting_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'ended', 'cancelled')),
  max_participants INTEGER DEFAULT 10,
  settings JSONB DEFAULT '{"video": true, "audio": true, "captions": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick room lookup by slug
CREATE INDEX IF NOT EXISTS idx_meeting_rooms_slug ON meeting_rooms(room_slug);
CREATE INDEX IF NOT EXISTS idx_meeting_rooms_calendar_event ON meeting_rooms(calendar_event_id);

-- ============================================
-- 2. Transcript Events Table (for live captions)
-- ============================================
CREATE TABLE IF NOT EXISTS transcript_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES meeting_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT,
  text TEXT NOT NULL,
  is_final BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick transcript lookup by room
CREATE INDEX IF NOT EXISTS idx_transcript_events_room ON transcript_events(room_id, created_at DESC);

-- ============================================
-- 3. Room Participants Table (track who's in call)
-- ============================================
CREATE TABLE IF NOT EXISTS room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES meeting_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT,
  peer_id TEXT,
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  is_muted BOOLEAN DEFAULT false,
  is_video_off BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id, is_active);

-- ============================================
-- 4. Enable Realtime for transcript_events
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE transcript_events;
ALTER PUBLICATION supabase_realtime ADD TABLE room_participants;

-- ============================================
-- 5. RLS Policies
-- ============================================
ALTER TABLE meeting_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

-- Meeting rooms: anyone authenticated can view, admins can create/update
CREATE POLICY "Users can view meeting rooms" ON meeting_rooms
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage meeting rooms" ON meeting_rooms
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    OR created_by = auth.uid()
  );

-- Transcript events: anyone in the room can read/write
CREATE POLICY "Room participants can view transcripts" ON transcript_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own transcripts" ON transcript_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Room participants: anyone can view, users manage their own
CREATE POLICY "Anyone can view participants" ON room_participants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage their participation" ON room_participants
  FOR ALL TO authenticated USING (user_id = auth.uid() OR user_id IS NULL);

-- ============================================
-- 6. Helper Functions
-- ============================================

-- Generate unique room slug
CREATE OR REPLACE FUNCTION generate_room_slug()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create meeting room from calendar event
CREATE OR REPLACE FUNCTION create_room_for_event(event_id UUID, creator_id UUID)
RETURNS UUID AS $$
DECLARE
  new_room_id UUID;
  event_title TEXT;
  event_time TIMESTAMPTZ;
  slug TEXT;
BEGIN
  -- Get event details
  SELECT title, start_time INTO event_title, event_time
  FROM calendar_events WHERE id = event_id;
  
  -- Generate unique slug
  LOOP
    slug := generate_room_slug();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM meeting_rooms WHERE room_slug = slug);
  END LOOP;
  
  -- Create room
  INSERT INTO meeting_rooms (room_slug, title, calendar_event_id, created_by, scheduled_at)
  VALUES (slug, COALESCE(event_title, 'Meeting'), event_id, creator_id, event_time)
  RETURNING id INTO new_room_id;
  
  RETURN new_room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION generate_room_slug() TO authenticated;
GRANT EXECUTE ON FUNCTION create_room_for_event(UUID, UUID) TO authenticated;
