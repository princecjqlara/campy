import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { pageId } = req.query;

    if (!pageId) {
        return res.status(400).json({ error: 'pageId is required' });
    }

    try {
        const { data, error } = await supabase
            .from('booking_settings')
            .select('*')
            .eq('page_id', pageId)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        // Return default settings if none exist
        const settings = data || {
            page_id: pageId,
            working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            start_time: '09:00',
            end_time: '17:00',
            slot_duration: 60,
            buffer_time: 15,
            max_advance_days: 30,
            custom_form: [],
            confirmation_message: 'Your booking has been confirmed! We look forward to meeting with you.',
            reminder_enabled: true,
            reminder_hours_before: 24
        };

        return res.status(200).json(settings);
    } catch (error) {
        console.error('Error fetching booking settings:', error);
        return res.status(500).json({ error: 'Failed to fetch booking settings' });
    }
}
