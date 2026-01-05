import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { pageId, date } = req.query;

    if (!pageId || !date) {
        return res.status(400).json({ error: 'pageId and date are required' });
    }

    try {
        // Get settings
        const { data: settings } = await supabase
            .from('booking_settings')
            .select('*')
            .eq('page_id', pageId)
            .single();

        const config = settings || {
            working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            start_time: '09:00:00',
            end_time: '17:00:00',
            slot_duration: 60
        };

        // Check if date is a working day
        const dateObj = new Date(date);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = dayNames[dateObj.getDay()];

        if (!config.working_days.includes(dayName)) {
            return res.status(200).json({ slots: [] });
        }

        // Get existing bookings for this date
        const { data: existingBookings } = await supabase
            .from('bookings')
            .select('booking_time')
            .eq('page_id', pageId)
            .eq('booking_date', date)
            .in('status', ['pending', 'confirmed']);

        const bookedTimes = (existingBookings || []).map(b => b.booking_time);

        // Generate available slots
        const slots = [];
        const startParts = config.start_time.split(':');
        const endParts = config.end_time.split(':');

        let currentHour = parseInt(startParts[0]);
        let currentMinute = parseInt(startParts[1] || 0);
        const endHour = parseInt(endParts[0]);
        const endMinute = parseInt(endParts[1] || 0);

        while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
            const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;

            if (!bookedTimes.includes(timeStr)) {
                slots.push(timeStr.slice(0, 5)); // Return HH:MM format
            }

            // Add slot duration
            currentMinute += config.slot_duration;
            while (currentMinute >= 60) {
                currentMinute -= 60;
                currentHour += 1;
            }
        }

        return res.status(200).json({ slots });
    } catch (error) {
        console.error('Error fetching available slots:', error);
        return res.status(500).json({ error: 'Failed to fetch available slots' });
    }
}
