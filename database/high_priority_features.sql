-- High Priority Features Database Migration
-- Run this in Supabase SQL Editor to enable notifications, communications, and calendar features

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- payment_due, payment_overdue, phase_transition, testing_complete, milestone, system
  title VARCHAR(255) NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  related_client_id UUID,
  related_entity_type VARCHAR(50), -- payment, phase, milestone, etc.
  related_entity_id UUID,
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
  action_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_related_client ON notifications(related_client_id);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- ============================================
-- COMMUNICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  communication_type VARCHAR(50) NOT NULL, -- email, call, meeting, note, internal
  direction VARCHAR(20) DEFAULT 'outbound', -- inbound, outbound, internal
  subject VARCHAR(255),
  content TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for communications
CREATE INDEX IF NOT EXISTS idx_communications_client_id ON communications(client_id);
CREATE INDEX IF NOT EXISTS idx_communications_user_id ON communications(user_id);
CREATE INDEX IF NOT EXISTS idx_communications_occurred_at ON communications(occurred_at DESC);

-- Enable RLS
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for communications
CREATE POLICY "Authenticated users can view communications" ON communications
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create communications" ON communications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own communications" ON communications
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- CALENDAR EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  event_type VARCHAR(50), -- payment_due, phase_transition, milestone, custom
  client_id UUID,
  color VARCHAR(20),
  all_day BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for calendar events
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client_id ON calendar_events(client_id);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for calendar events
CREATE POLICY "Users can view their own calendar events" ON calendar_events
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can create calendar events" ON calendar_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update their own calendar events" ON calendar_events
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calendar events" ON calendar_events
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communications_updated_at
  BEFORE UPDATE ON communications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check and create payment due notifications
CREATE OR REPLACE FUNCTION check_payment_due_notifications()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  client_record RECORD;
  days_until_due INTEGER;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  -- Find clients with upcoming or overdue payments
  FOR client_record IN 
    SELECT c.*, u.id as user_id
    FROM clients c
    LEFT JOIN users u ON c.assigned_to = u.id OR c.assigned_to = u.name
    WHERE c.payment_status IN ('unpaid', 'partial')
    AND c.start_date IS NOT NULL
    AND c.payment_schedule = 'monthly'
  LOOP
    -- Calculate days until next payment (simplified - monthly payments)
    days_until_due := EXTRACT(DAY FROM (
      (client_record.start_date + INTERVAL '1 month' * COALESCE(client_record.months_with_client, 0) + INTERVAL '1 month') - CURRENT_DATE
    ));
    
    -- Create notification for overdue payments
    IF days_until_due < 0 THEN
      notification_title := 'Payment Overdue: ' || client_record.client_name;
      notification_message := 'Payment for ' || client_record.client_name || ' is ' || ABS(days_until_due) || ' days overdue.';
      
      INSERT INTO notifications (user_id, type, title, message, related_client_id, priority, action_url)
      VALUES (
        COALESCE(client_record.user_id, auth.uid()),
        'payment_overdue',
        notification_title,
        notification_message,
        client_record.id,
        'urgent',
        '/clients/' || client_record.id
      )
      ON CONFLICT DO NOTHING;
    -- Create notification for upcoming payments (3 days before)
    ELSIF days_until_due <= 3 AND days_until_due > 0 THEN
      notification_title := 'Payment Due Soon: ' || client_record.client_name;
      notification_message := 'Payment for ' || client_record.client_name || ' is due in ' || days_until_due || ' days.';
      
      INSERT INTO notifications (user_id, type, title, message, related_client_id, priority, action_url)
      VALUES (
        COALESCE(client_record.user_id, auth.uid()),
        'payment_due',
        notification_title,
        notification_message,
        client_record.id,
        'high',
        '/clients/' || client_record.id
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION check_payment_due_notifications() TO authenticated;

-- ============================================
-- NOTES
-- ============================================
-- 1. Run this migration in Supabase SQL Editor
-- 2. The notifications system will automatically create alerts
-- 3. Communication logs can be added manually or via API
-- 4. Calendar events are auto-generated from client data
-- 5. Payment notifications are checked periodically (via app logic)
