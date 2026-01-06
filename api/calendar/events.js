import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role key to bypass RLS
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Database not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    // GET - Fetch calendar events
    if (req.method === 'GET') {
        try {
            const { start, end } = req.query;

            let query = supabase.from('calendar_events').select('*');

            if (start) {
                query = query.gte('start_time', start);
            }
            if (end) {
                query = query.lte('start_time', end);
            }

            const { data, error } = await query.order('start_time');

            if (error) throw error;

            return res.status(200).json({ events: data || [] });
        } catch (error) {
            console.error('Error fetching calendar events:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    // POST - Create calendar event
    if (req.method === 'POST') {
        try {
            const eventData = req.body;

            const { data, error } = await supabase
                .from('calendar_events')
                .insert(eventData)
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Calendar event created:', data.id);
            return res.status(200).json({ success: true, event: data });
        } catch (error) {
            console.error('Error creating calendar event:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    // DELETE - Delete one or more calendar events
    if (req.method === 'DELETE') {
        try {
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: 'Missing event IDs' });
            }

            console.log('Deleting calendar events:', ids);

            // Delete all specified events
            const { error } = await supabase
                .from('calendar_events')
                .delete()
                .in('id', ids);

            if (error) throw error;

            console.log('✅ Deleted', ids.length, 'calendar events');
            return res.status(200).json({ success: true, deleted: ids.length });
        } catch (error) {
            console.error('Error deleting calendar events:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
