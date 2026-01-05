import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with fallbacks
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check Supabase config
    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase config:', { url: !!supabaseUrl, key: !!supabaseKey });
        return res.status(500).json({
            error: 'Database not configured',
            details: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
        });
    }

    // Create Supabase client with admin options to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    try {
        const {
            pageId,
            psid,
            date,
            time,
            contactName,
            contactEmail,
            contactPhone,
            notes,
            customFormData,
            customMessage
        } = req.body;

        if (!pageId || !date || !time || !contactName) {
            return res.status(400).json({ error: 'Missing required fields: pageId, date, time, contactName' });
        }

        // Create booking datetime
        const bookingDatetime = new Date(`${date}T${time}:00`);

        // Create the booking
        const bookingData = {
            page_id: pageId,
            contact_psid: psid || null,
            contact_name: contactName,
            contact_email: contactEmail || null,
            contact_phone: contactPhone || null,
            booking_date: date,
            booking_time: `${time}:00`,
            booking_datetime: bookingDatetime.toISOString(),
            form_data: customFormData || {},
            notes: notes || null,
            status: 'confirmed',
            confirmed_at: new Date().toISOString()
        };

        console.log('Attempting to insert booking:', bookingData);

        const { data, error: bookingError } = await supabase
            .from('bookings')
            .insert(bookingData)
            .select()
            .single();

        if (bookingError) {
            console.error('Supabase booking error:', bookingError);

            // Check for common errors
            if (bookingError.code === '42P01' || bookingError.message?.includes('does not exist')) {
                return res.status(500).json({
                    error: 'Bookings table not found',
                    details: 'Please run the booking_migration.sql in Supabase SQL Editor',
                    code: bookingError.code
                });
            }

            if (bookingError.code === '42501' || bookingError.message?.includes('permission denied')) {
                return res.status(500).json({
                    error: 'Permission denied',
                    details: 'RLS policy blocking insert. Check that RLS allows inserts.',
                    code: bookingError.code
                });
            }

            return res.status(500).json({
                error: 'Failed to create booking',
                details: bookingError.message,
                code: bookingError.code,
                hint: bookingError.hint || null
            });
        }

        console.log('Booking created successfully:', data?.id);

        // Build confirmation message
        const formattedDate = new Date(date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const hour = parseInt(time.split(':')[0]);
        const minute = time.split(':')[1];
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        const formattedTime = `${hour12}:${minute} ${ampm}`;

        const confirmationMessage = customMessage ||
            `✅ Booking Confirmed!\n\n📅 Date: ${formattedDate}\n🕐 Time: ${formattedTime}\n\nWe look forward to meeting with you, ${contactName}!`;

        // Send confirmation to Messenger if we have PSID
        if (psid) {
            try {
                const { data: page } = await supabase
                    .from('facebook_pages')
                    .select('page_access_token')
                    .eq('page_id', pageId)
                    .single();

                if (page?.page_access_token) {
                    await fetch(`${GRAPH_API_BASE}/${pageId}/messages?access_token=${page.page_access_token}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipient: { id: psid },
                            message: { text: confirmationMessage }
                        })
                    });
                }
            } catch (msgError) {
                console.error('Failed to send confirmation message:', msgError);
            }
        }

        return res.status(200).json({
            success: true,
            booking: data,
            message: 'Booking confirmed successfully'
        });
    } catch (error) {
        console.error('Error creating booking:', error);
        return res.status(500).json({
            error: 'Failed to create booking',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
