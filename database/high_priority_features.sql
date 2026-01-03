-- Database schema for high priority features
-- Run this in Supabase SQL Editor

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('payment_due', 'payment_overdue', 'phase_transition', 'milestone', 'testing_complete', 'task_due', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  related_entity_type TEXT, -- 'client', 'payment', 'phase', etc.
  related_entity_id UUID,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  read BOOLEAN DEFAULT false,
  action_url TEXT, -- URL to navigate when clicked
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================
-- COMMUNICATION LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('note', 'email', 'call', 'meeting', 'message', 'update')),
  subject TEXT,
  content TEXT NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound', 'internal')),
  contact_method TEXT, -- 'email', 'phone', 'in-person', 'chat', etc.
  duration_minutes INTEGER, -- For calls/meetings
  scheduled_at TIMESTAMPTZ, -- For scheduled meetings/calls
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  attachments JSONB DEFAULT '[]', -- Array of file references
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communications_client_id ON communications(client_id);
CREATE INDEX IF NOT EXISTS idx_communications_user_id ON communications(user_id);
CREATE INDEX IF NOT EXISTS idx_communications_occurred_at ON communications(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_communications_type ON communications(type);

-- ============================================
-- CALENDAR EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- For personal events
  team_member_id UUID REFERENCES users(id) ON DELETE SET NULL, -- For team member availability
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('meeting', 'payment_due', 'phase_transition', 'milestone', 'deadline', 'reminder', 'availability', 'custom')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,
  recurring BOOLEAN DEFAULT false,
  recurring_pattern JSONB, -- For recurring events
  location TEXT,
  attendees JSONB DEFAULT '[]', -- Array of user IDs or emails
  reminder_minutes INTEGER, -- Minutes before event to remind
  color TEXT, -- For calendar display
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_client_id ON calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type ON calendar_events(event_type);

-- ============================================
-- REPORTS TABLE (for saved reports)
-- ============================================
CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('revenue', 'clients', 'team', 'conversion', 'churn', 'package', 'custom')),
  filters JSONB NOT NULL, -- Saved filter criteria
  chart_config JSONB, -- Chart type, metrics, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_user_id ON saved_reports(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Notifications: Users can only see their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can create notifications" ON notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Communications: All authenticated users can view, only assigned users can create
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view communications" ON communications
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can create communications" ON communications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update their own communications" ON communications
  FOR UPDATE USING (auth.uid() = user_id);

-- Calendar Events: Users can view all, manage their own
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view calendar events" ON calendar_events
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can create calendar events" ON calendar_events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update their own calendar events" ON calendar_events
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = team_member_id);
CREATE POLICY "Users can delete their own calendar events" ON calendar_events
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = team_member_id);

-- Saved Reports: Users can only see their own reports
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own reports" ON saved_reports
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamps
CREATE TRIGGER communications_updated_at
  BEFORE UPDATE ON communications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER saved_reports_updated_at
  BEFORE UPDATE ON saved_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create payment due notifications
CREATE OR REPLACE FUNCTION create_payment_notifications()
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
    LEFT JOIN users u ON c.assigned_to = u.id
    WHERE c.payment_status IN ('unpaid', 'partial')
    AND c.start_date IS NOT NULL
  LOOP
    -- Calculate days until next payment (simplified - monthly payments)
    days_until_due := EXTRACT(DAY FROM (client_record.start_date + INTERVAL '1 month' * client_record.months_with_client - CURRENT_DATE));
    
    -- Create notification for overdue payments
    IF days_until_due < 0 THEN
      notification_title := 'Payment Overdue: ' || client_record.client_name;
      notification_message := 'Payment for ' || client_record.client_name || ' is ' || ABS(days_until_due) || ' days overdue.';
      
      INSERT INTO notifications (user_id, type, title, message, related_client_id, priority, action_url)
      VALUES (
        client_record.user_id,
        'payment_overdue',
        notification_title,
        notification_message,
        client_record.id,
        'urgent',
        '/clients/' || client_record.id
      );
    -- Create notification for upcoming payments (3 days before)
    ELSIF days_until_due <= 3 AND days_until_due > 0 THEN
      notification_title := 'Payment Due Soon: ' || client_record.client_name;
      notification_message := 'Payment for ' || client_record.client_name || ' is due in ' || days_until_due || ' days.';
      
      INSERT INTO notifications (user_id, type, title, message, related_client_id, priority, action_url)
      VALUES (
        client_record.user_id,
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

-- Function to create phase transition notifications
CREATE OR REPLACE FUNCTION notify_phase_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  assigned_user_id UUID;
BEGIN
  -- Get assigned user
  SELECT assigned_to INTO assigned_user_id FROM clients WHERE id = NEW.client_id;
  
  -- Create notification for phase transition
  INSERT INTO notifications (user_id, type, title, message, related_client_id, related_entity_type, related_entity_id, action_url)
  VALUES (
    assigned_user_id,
    'phase_transition',
    'Phase Changed: ' || NEW.to_phase,
    'Client moved from ' || COALESCE(NEW.from_phase, 'unknown') || ' to ' || NEW.to_phase,
    NEW.client_id,
    'phase',
    NEW.id,
    '/clients/' || NEW.client_id
  );
  
  RETURN NEW;
END;
$$;

-- Trigger for phase transitions
DROP TRIGGER IF EXISTS on_phase_transition ON stage_history;
CREATE TRIGGER on_phase_transition
  AFTER INSERT ON stage_history
  FOR EACH ROW EXECUTE FUNCTION notify_phase_transition();

