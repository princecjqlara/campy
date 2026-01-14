import { createClient } from '@supabase/supabase-js';

/**
 * Meeting Reminder Cron Job
 * Sends reminders for upcoming meetings/bookings
 * Call via: GET /api/cron/meeting-reminder
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

export default async function handler(req, res) {
    // Allow GET and POST for cron job compatibility
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('[CRON] Meeting reminder job started');

    // Initialize Supabase
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.log('[CRON] Supabase not configured');
        return res.status(200).json({
            success: true,
            message: 'Supabase not configured, skipping',
            sent: 0
        });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const now = new Date();
        const results = {
            checked: 0,
            sent: 0,
            errors: []
        };

        // Get bookings in the next 24 hours that haven't been reminded
        const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        // First: 24-hour reminders
        const { data: bookings24h, error: error24h } = await supabase
            .from('bookings')
            .select('*')
            .in('status', ['pending', 'confirmed'])
            .gte('booking_datetime', now.toISOString())
            .lte('booking_datetime', in24Hours.toISOString())
            .gt('booking_datetime', in2Hours.toISOString()) // Not within 2 hours
            .or('reminder_24h_sent.is.null,reminder_24h_sent.eq.false')
            .not('contact_psid', 'is', null)
            .limit(50);

        if (error24h) {
            if (error24h.code === '42P01' || error24h.message?.includes('does not exist')) {
                console.log('[CRON] Bookings table does not exist');
                return res.status(200).json({
                    success: true,
                    message: 'Bookings table not found',
                    sent: 0
                });
            }
            throw error24h;
        }

        // Second: 2-hour reminders
        const in15Min = new Date(now.getTime() + 15 * 60 * 1000);
        const { data: bookings2h, error: error2h } = await supabase
            .from('bookings')
            .select('*')
            .in('status', ['pending', 'confirmed'])
            .gte('booking_datetime', in15Min.toISOString())
            .lte('booking_datetime', in2Hours.toISOString())
            .or('reminder_2h_sent.is.null,reminder_2h_sent.eq.false')
            .not('contact_psid', 'is', null)
            .limit(50);

        if (error2h && error2h.code !== '42P01') {
            console.error('[CRON] Error fetching 2h bookings:', error2h);
        }

        const allBookings = [
            ...(bookings24h || []).map(b => ({ ...b, reminderType: '24h' })),
            ...(bookings2h || []).map(b => ({ ...b, reminderType: '2h' }))
        ];

        results.checked = allBookings.length;
        console.log(`[CRON] Found ${allBookings.length} bookings needing reminders`);

        for (const booking of allBookings) {
            try {
                // Get page access token
                const { data: page } = await supabase
                    .from('facebook_pages')
                    .select('page_access_token')
                    .eq('page_id', booking.page_id)
                    .single();

                if (!page?.page_access_token) {
                    console.log(`[CRON] No token for page ${booking.page_id}`);
                    continue;
                }

                // Format the booking time
                const bookingTime = new Date(booking.booking_datetime);
                const formattedDate = bookingTime.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                });
                const hour = bookingTime.getHours();
                const minute = String(bookingTime.getMinutes()).padStart(2, '0');
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const hour12 = hour % 12 || 12;
                const formattedTime = `${hour12}:${minute} ${ampm}`;

                // Create reminder message
                const message = booking.reminderType === '24h'
                    ? `📅 Reminder: Your appointment is tomorrow!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nWe look forward to meeting with you${booking.contact_name ? ', ' + booking.contact_name : ''}!`
                    : `⏰ Your appointment is coming up in about 2 hours!\n\n🗓 ${formattedDate}\n🕐 ${formattedTime}\n\nSee you very soon!`;

                // Send via Messenger
                const msgResponse = await fetch(
                    `${GRAPH_API_BASE}/${booking.page_id}/messages?access_token=${page.page_access_token}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recipient: { id: booking.contact_psid },
                            message: { text: message },
                            messaging_type: 'MESSAGE_TAG',
                            tag: 'CONFIRMED_EVENT_UPDATE'
                        })
                    }
                );

                if (msgResponse.ok) {
                    // Mark reminder as sent
                    const updateField = booking.reminderType === '24h'
                        ? { reminder_24h_sent: true }
                        : { reminder_2h_sent: true };

                    await supabase
                        .from('bookings')
                        .update({ ...updateField, updated_at: new Date().toISOString() })
                        .eq('id', booking.id);

                    results.sent++;
                    console.log(`[CRON] Sent ${booking.reminderType} reminder for booking ${booking.id}`);
                } else {
                    const err = await msgResponse.json();
                    console.error(`[CRON] Failed to send reminder for ${booking.id}:`, err);
                    results.errors.push({
                        bookingId: booking.id,
                        error: err.error?.message || 'Unknown error'
                    });
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (bookingError) {
                console.error(`[CRON] Error processing booking ${booking.id}:`, bookingError);
                results.errors.push({
                    bookingId: booking.id,
                    error: bookingError.message
                });
            }
        }

        console.log(`[CRON] Meeting reminder complete: ${results.sent} sent, ${results.errors.length} errors`);

        return res.status(200).json({
            success: true,
            message: 'Meeting reminders processed',
            ...results
        });

    } catch (error) {
        console.error('[CRON] Fatal error in meeting reminder:', error);
        return res.status(500).json({ error: error.message });
    }
}

export const config = {
    api: {
        bodyParser: true
    }
};
