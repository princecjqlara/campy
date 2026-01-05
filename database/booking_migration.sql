-- Booking System Migration
-- Run this in your Supabase SQL Editor

-- Booking settings per page
CREATE TABLE IF NOT EXISTS booking_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id TEXT REFERENCES facebook_pages(page_id) ON DELETE CASCADE,
    working_days TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
    start_time TIME DEFAULT '09:00',
    end_time TIME DEFAULT '17:00',
    slot_duration INT DEFAULT 60, -- minutes
    buffer_time INT DEFAULT 15, -- minutes between slots
    max_advance_days INT DEFAULT 30, -- how far ahead can book
    custom_form JSONB DEFAULT '[]', -- array of form fields
    confirmation_message TEXT DEFAULT 'Your booking has been confirmed! We look forward to meeting with you.',
    reminder_enabled BOOLEAN DEFAULT true,
    reminder_hours_before INT DEFAULT 24,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(page_id)
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id TEXT,
    contact_psid TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    booking_datetime TIMESTAMPTZ NOT NULL,
    form_data JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending', -- pending, confirmed, cancelled, completed, no_show
    notes TEXT,
    confirmation_sent BOOLEAN DEFAULT false,
    reminder_sent BOOLEAN DEFAULT false,
    follow_up_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_page_id ON bookings(page_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_datetime ON bookings(booking_datetime);
CREATE INDEX IF NOT EXISTS idx_bookings_psid ON bookings(contact_psid);

-- RLS Policies
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Anyone can read booking settings (needed for public booking page)
DROP POLICY IF EXISTS "Booking settings viewable by all" ON booking_settings;
CREATE POLICY "Booking settings viewable by all" ON booking_settings
    FOR SELECT USING (true);

-- Only authenticated users can modify booking settings
DROP POLICY IF EXISTS "Booking settings modifiable by authenticated" ON booking_settings;
CREATE POLICY "Booking settings modifiable by authenticated" ON booking_settings
    FOR ALL USING (auth.role() = 'authenticated');

-- Anyone can create bookings (public booking page)
DROP POLICY IF EXISTS "Bookings insertable by all" ON bookings;
CREATE POLICY "Bookings insertable by all" ON bookings
    FOR INSERT WITH CHECK (true);

-- Authenticated users can view and modify bookings
DROP POLICY IF EXISTS "Bookings viewable by authenticated" ON bookings;
CREATE POLICY "Bookings viewable by authenticated" ON bookings
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Bookings modifiable by authenticated" ON bookings;
CREATE POLICY "Bookings modifiable by authenticated" ON bookings
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Function to get available slots for a date
CREATE OR REPLACE FUNCTION get_available_slots(
    p_page_id TEXT,
    p_date DATE
)
RETURNS TABLE (slot_time TIME) AS $$
DECLARE
    v_settings booking_settings%ROWTYPE;
    v_slot TIME;
    v_day_name TEXT;
BEGIN
    -- Get settings
    SELECT * INTO v_settings FROM booking_settings WHERE page_id = p_page_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Check if requested date is a working day
    v_day_name := TO_CHAR(p_date, 'Dy');
    IF NOT v_day_name = ANY(v_settings.working_days) THEN
        RETURN;
    END IF;
    
    -- Generate slots
    v_slot := v_settings.start_time;
    WHILE v_slot < v_settings.end_time LOOP
        -- Check if slot is not already booked
        IF NOT EXISTS (
            SELECT 1 FROM bookings 
            WHERE page_id = p_page_id 
            AND booking_date = p_date 
            AND booking_time = v_slot
            AND status IN ('pending', 'confirmed')
        ) THEN
            slot_time := v_slot;
            RETURN NEXT;
        END IF;
        
        v_slot := v_slot + (v_settings.slot_duration || ' minutes')::INTERVAL;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;
