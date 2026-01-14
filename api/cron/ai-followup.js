import { createClient } from '@supabase/supabase-js';

/**
 * AI Silence Detection Cron
 * Finds conversations with no activity for 24+ hours and schedules follow-ups
 * at the contact's best time to contact (not just a fixed interval)
 * Runs every 30 minutes via Vercel cron
 */

let supabase = null;
function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (!url || !key) return null;
        supabase = createClient(url, key);
    }
    return supabase;
}

/**
 * Calculate best time to contact based on engagement history
 * Simplified version for cron (doesn't import from client-side module)
 */
async function calculateBestTimeForContact(db, conversationId) {
    try {
        // Get engagement history for this contact
        const { data: engagements } = await db
            .from('contact_engagement')
            .select('day_of_week, hour_of_day, response_latency_seconds, engagement_score')
            .eq('conversation_id', conversationId)
            .eq('message_direction', 'inbound')
            .order('message_timestamp', { ascending: false })
            .limit(20);

        const now = new Date();

        // If no engagement data, use default business hours
        if (!engagements || engagements.length === 0) {
            // Default: next occurrence of 10 AM
            return getNextOccurrenceOfHour(10);
        }

        // Calculate weighted scores for each day/hour
        const timeScores = {};
        for (const eng of engagements) {
            const key = `${eng.day_of_week}-${eng.hour_of_day}`;
            if (!timeScores[key]) {
                timeScores[key] = {
                    dayOfWeek: eng.day_of_week,
                    hourOfDay: eng.hour_of_day,
                    count: 0,
                    totalScore: 0
                };
            }
            timeScores[key].count++;
            timeScores[key].totalScore += eng.engagement_score || 1;
        }

        // Find best slot
        let bestSlot = null;
        let bestScore = 0;
        for (const slot of Object.values(timeScores)) {
            const score = slot.count * (slot.totalScore / slot.count);
            if (score > bestScore) {
                bestScore = score;
                bestSlot = slot;
            }
        }

        if (!bestSlot) {
            return getNextOccurrenceOfHour(10);
        }

        // Get next occurrence of best day/hour
        return getNextOccurrence(bestSlot.dayOfWeek, bestSlot.hourOfDay);

    } catch (error) {
        console.error('[CRON] Error calculating best time:', error);
        // Fallback to default
        return getNextOccurrenceOfHour(10);
    }
}

/**
 * Get next occurrence of a specific day and hour
 * Schedules at the actual best time - messaging code handles 24h window with tags
 */
function getNextOccurrence(targetDay, targetHour) {
    const now = new Date();
    const result = new Date(now);
    result.setHours(targetHour, 0, 0, 0);

    // Calculate days until target day
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;

    if (daysUntil < 0 || (daysUntil === 0 && now.getHours() >= targetHour)) {
        daysUntil += 7;
    }

    result.setDate(result.getDate() + daysUntil);

    // If it's today but in the past, add 7 days
    if (result <= now) {
        result.setDate(result.getDate() + 7);
    }

    // No cap - follow-ups can be scheduled at the true best time
    // The sendMessage function handles 24h window by using ACCOUNT_UPDATE tag

    return result;
}

/**
 * Get next occurrence of a specific hour (today or tomorrow)
 */
function getNextOccurrenceOfHour(targetHour) {
    const now = new Date();
    const result = new Date(now);
    result.setHours(targetHour, 0, 0, 0);

    if (result <= now) {
        result.setDate(result.getDate() + 1);
    }

    return result;
}

export default async function handler(req, res) {
    // Verify cron authorization (optional - only checked if CRON_SECRET is set)
    const authHeader = req.headers.authorization;
    const vercelCron = req.headers['x-vercel-cron']; // Vercel's built-in cron header
    const cronSecret = process.env.CRON_SECRET;

    // Skip auth if Vercel cron OR if no secret is configured
    if (cronSecret && !vercelCron && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[CRON] Silence detection started');

    try {
        const db = getSupabase();
        if (!db) {
            throw new Error('Database not configured');
        }

        const now = new Date();
        const results = {
            scanned: 0,
            scheduled: 0,
            skipped: 0
        };

        // Get AI chatbot config
        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        const config = settings?.value || {};
        // AGGRESSIVE SETTINGS: Reduced silence hours, increased capacity
        const silenceHours = config.intuition_silence_hours || 4; // Was 24, now 4 hours default
        const maxPerRun = config.max_followups_per_cron || 100; // Was 20, now 100 per run

        // Calculate cutoff time (conversations inactive for X hours)
        const cutoffTime = new Date(now.getTime() - (silenceHours * 60 * 60 * 1000));

        // Find conversations that need follow-up
        // REMOVED: last_message_from_page requirement - follow up even if user ghosted
        const { data: conversations, error } = await db
            .from('facebook_conversations')
            .select(`
                conversation_id,
                page_id,
                participant_name,
                participant_id,
                last_message_time,
                last_message_from_page,
                active_goal_id
            `)
            .or('ai_enabled.is.null,ai_enabled.eq.true') // Default to enabled
            .or('human_takeover.is.null,human_takeover.eq.false')
            .or('opt_out.is.null,opt_out.eq.false')
            .lt('last_message_time', cutoffTime.toISOString())
            .or(`cooldown_until.is.null,cooldown_until.lt.${now.toISOString()}`)
            .order('last_message_time', { ascending: true })
            .limit(maxPerRun);

        if (error) {
            console.error('[CRON] Error fetching conversations:', error);
            throw error;
        }

        if (!conversations || conversations.length === 0) {
            console.log('[CRON] No conversations need silence follow-up');
            return res.status(200).json({ message: 'No silence follow-ups needed', ...results });
        }

        console.log(`[CRON] Found ${conversations.length} conversations with silence`);
        results.scanned = conversations.length;

        for (const conv of conversations) {
            try {
                // Delete any existing pending follow-ups - we'll create a fresh one with AI analysis
                const { data: existing } = await db
                    .from('ai_followup_schedule')
                    .select('id')
                    .eq('conversation_id', conv.conversation_id)
                    .eq('status', 'pending');

                if (existing && existing.length > 0) {
                    await db
                        .from('ai_followup_schedule')
                        .delete()
                        .eq('conversation_id', conv.conversation_id)
                        .eq('status', 'pending');
                    console.log(`[CRON] Deleted ${existing.length} old follow-ups for ${conv.participant_name || conv.conversation_id}`);
                }

                // Calculate hours since last message
                const hoursSince = Math.floor((now - new Date(conv.last_message_time)) / (1000 * 60 * 60));

                // Get recent messages for AI analysis
                const { data: recentMessages } = await db
                    .from('facebook_messages')
                    .select('message_text, is_from_page, timestamp')
                    .eq('conversation_id', conv.conversation_id)
                    .order('timestamp', { ascending: false })
                    .limit(20);

                // Use AI to analyze conversation and determine follow-up timing
                // Default: AGGRESSIVE 2 hours wait
                let analysis = { wait_hours: 2, reason: `No response for ${hoursSince} hours - urgent follow-up`, follow_up_type: 'best_time' };

                if (recentMessages && recentMessages.length > 0) {
                    const nvidiaKey = process.env.NVIDIA_API_KEY;
                    if (nvidiaKey) {
                        try {
                            // Build conversation summary
                            const messagesSummary = recentMessages.reverse().map(m =>
                                `${m.is_from_page ? 'AI' : 'Customer'}: ${m.message_text || '[attachment]'}`
                            ).join('\n');

                            // ALWAYS be aggressive - max 6 hour wait
                            const maxWaitHours = 6;
                            const aggressiveNote = '\n\n⚡ ALWAYS BE AGGRESSIVE! Use SHORT wait times (1-4 hours max). Keep leads warm!';

                            const analysisPrompt = `You are an AGGRESSIVE sales AI. Your job is to keep leads WARM by following up QUICKLY.

CONVERSATION (last activity ${hoursSince} hours ago):
${messagesSummary}
${aggressiveNote}

You must respond with ONLY valid JSON (no markdown, no explanation):
{
  "skip_followup": <true/false>,
  "skip_reason": "<if skip_followup is true, explain why>",
  "wait_hours": <number between 0.5-6>,
  "reason": "<brief explanation>"
}

WHEN TO SKIP (skip_followup: true):
- Customer said "I'll message you later" or "I'll get back to you"
- Customer specified a time like "call me tomorrow at 2pm"
- Customer said they're busy ("in a meeting", "busy today")

AGGRESSIVE TIMING (MAX 6 HOURS):
- Any silence: wait 1-3 hours (DEFAULT)
- Showed buying intent: wait 0.5-1 hour (URGENT!)
- Was about to book: wait 0.5 hour (IMMEDIATE!)
- Just received pricing: wait 1-2 hours
- Asked questions: wait 1 hour`;

                            const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${nvidiaKey} `,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    model: 'meta/llama-3.1-8b-instruct',
                                    messages: [{ role: 'user', content: analysisPrompt }],
                                    max_tokens: 200,
                                    temperature: 0.3
                                })
                            });

                            if (response.ok) {
                                const aiResult = await response.json();
                                const analysisText = aiResult.choices?.[0]?.message?.content?.trim();
                                const cleanJson = analysisText.replace(/```json\n ?|\n ? ```/g, '').trim();
                                const parsed = JSON.parse(cleanJson);

                                // Check if AI says to skip follow-up
                                if (parsed.skip_followup === true) {
                                    console.log(`[CRON] ⏸️ SKIPPING ${conv.participant_name}: ${parsed.skip_reason || 'Customer specified callback time or busy'} `);
                                    results.skipped++;
                                    continue; // Skip to next conversation
                                }

                                analysis = {
                                    wait_hours: Math.min(Math.max(parsed.wait_hours || 2, 0.5), 24),
                                    reason: parsed.reason || `Silent for ${hoursSince} hours`,
                                    follow_up_type: parsed.follow_up_type || 'gentle_reminder'
                                };
                                console.log(`[CRON] 🔥 AI analysis for ${conv.participant_name}: wait ${analysis.wait_hours} h - ${analysis.reason} `);
                            }
                        } catch (aiErr) {
                            console.log(`[CRON] AI analysis error(using defaults): `, aiErr.message);
                        }
                    }
                }

                // Calculate scheduled time based on AI analysis
                const scheduledAt = new Date(now.getTime() + analysis.wait_hours * 60 * 60 * 1000);

                // Create follow-up with AI-determined timing
                const { error: insertError } = await db
                    .from('ai_followup_schedule')
                    .insert({
                        conversation_id: conv.conversation_id,
                        page_id: conv.page_id,
                        scheduled_at: scheduledAt.toISOString(),
                        follow_up_type: 'best_time',  // Database only allows 'best_time'
                        reason: analysis.reason,
                        status: 'pending'
                    });

                if (insertError) {
                    console.error(`[CRON] Error scheduling for ${conv.conversation_id}: `, insertError);
                    results.skipped++;
                } else {
                    console.log(`[CRON] ✅ Scheduled intelligent follow - up for ${conv.participant_name || conv.conversation_id} in ${analysis.wait_hours}h`);
                    results.scheduled++;

                    // Log the action
                    await db.from('ai_action_log').insert({
                        conversation_id: conv.conversation_id,
                        page_id: conv.page_id,
                        action_type: 'silence_detected',
                        action_data: { hoursSince, waitHours: analysis.wait_hours, reason: analysis.reason },
                        explanation: `AI intuition: ${analysis.reason} `
                    });
                }
            } catch (err) {
                console.error(`[CRON] Error processing ${conv.conversation_id}: `, err);
                results.skipped++;
            }
        }

        console.log(`[CRON] Completed: ${results.scheduled} scheduled, ${results.skipped} skipped`);

        return res.status(200).json({
            message: 'Silence detection complete',
            ...results
        });

    } catch (error) {
        console.error('[CRON] Fatal error:', error);
        return res.status(500).json({ error: error.message });
    }
}

export const config = {
    api: {
        bodyParser: true
    }
};
