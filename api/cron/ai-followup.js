import { createClient } from '@supabase/supabase-js';

/**
 * AI Follow-Up Cron Handler
 * Processes scheduled follow-ups and sends messages
 * Called by Vercel cron or manual trigger
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

export default async function handler(req, res) {
    // Verify cron authorization
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        console.log('[CRON] Unauthorized request');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[CRON] AI Follow-up processor started');

    try {
        const db = getSupabase();
        if (!db) {
            throw new Error('Database not configured');
        }

        const now = new Date();
        const results = {
            processed: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
            errors: []
        };

        // Get pending follow-ups that are due
        const { data: followUps, error: fetchError } = await db
            .from('ai_followup_schedule')
            .select(`
                *,
                conversation:conversation_id(
                    participant_id,
                    participant_name,
                    human_takeover,
                    takeover_until,
                    opt_out,
                    cooldown_until,
                    ai_enabled
                ),
                page:page_id(
                    page_id,
                    page_access_token,
                    page_name
                ),
                goal:goal_id(
                    goal_type,
                    goal_prompt
                )
            `)
            .eq('status', 'pending')
            .lte('scheduled_at', now.toISOString())
            .order('scheduled_at', { ascending: true })
            .limit(20);

        if (fetchError) {
            console.error('[CRON] Error fetching follow-ups:', fetchError);
            throw fetchError;
        }

        if (!followUps || followUps.length === 0) {
            console.log('[CRON] No pending follow-ups');
            return res.status(200).json({ message: 'No pending follow-ups', ...results });
        }

        console.log(`[CRON] Processing ${followUps.length} follow-ups`);

        for (const followUp of followUps) {
            results.processed++;

            try {
                // Safety checks
                const conversation = followUp.conversation;

                if (!conversation) {
                    await markSkipped(db, followUp.id, 'Conversation not found');
                    results.skipped++;
                    continue;
                }

                if (conversation.opt_out) {
                    await markSkipped(db, followUp.id, 'Contact opted out');
                    results.skipped++;
                    continue;
                }

                if (!conversation.ai_enabled) {
                    await markSkipped(db, followUp.id, 'AI disabled for conversation');
                    results.skipped++;
                    continue;
                }

                if (conversation.human_takeover) {
                    const takeoverUntil = conversation.takeover_until ? new Date(conversation.takeover_until) : null;
                    if (!takeoverUntil || takeoverUntil > now) {
                        await markSkipped(db, followUp.id, 'Human takeover active');
                        results.skipped++;
                        continue;
                    }
                }

                if (conversation.cooldown_until) {
                    const cooldownUntil = new Date(conversation.cooldown_until);
                    if (cooldownUntil > now) {
                        // Reschedule for after cooldown
                        await reschedule(db, followUp.id, cooldownUntil);
                        results.skipped++;
                        continue;
                    }
                }

                // Check page access token
                const page = followUp.page;
                if (!page?.page_access_token) {
                    await markFailed(db, followUp.id, 'No page access token');
                    results.failed++;
                    continue;
                }

                // Generate or use template message
                let messageText = followUp.message_template;

                if (!messageText) {
                    messageText = await generateFollowUpMessage(followUp, conversation);
                }

                // Send the message
                const sendResult = await sendMessage(
                    page.page_id,
                    conversation.participant_id,
                    messageText,
                    page.page_access_token
                );

                if (sendResult.success) {
                    await markSent(db, followUp.id, sendResult.messageId);

                    // Update conversation cooldown
                    await db
                        .from('facebook_conversations')
                        .update({
                            cooldown_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
                            last_ai_message_at: now.toISOString(),
                            updated_at: now.toISOString()
                        })
                        .eq('conversation_id', followUp.conversation_id);

                    // Log the action
                    await db.from('ai_action_log').insert({
                        conversation_id: followUp.conversation_id,
                        page_id: page.page_id,
                        action_type: 'followup_sent',
                        action_data: {
                            follow_up_id: followUp.id,
                            follow_up_type: followUp.follow_up_type,
                            message_id: sendResult.messageId
                        },
                        explanation: `${followUp.follow_up_type} follow-up sent: ${followUp.reason || 'scheduled'}`,
                        goal_id: followUp.goal_id
                    });

                    results.sent++;
                    console.log(`[CRON] Sent follow-up for ${conversation.participant_name || conversation.participant_id}`);
                } else {
                    await markFailed(db, followUp.id, sendResult.error);
                    results.failed++;
                    results.errors.push({
                        followUpId: followUp.id,
                        error: sendResult.error
                    });
                }

            } catch (error) {
                console.error(`[CRON] Error processing follow-up ${followUp.id}:`, error);
                await markFailed(db, followUp.id, error.message);
                results.failed++;
                results.errors.push({
                    followUpId: followUp.id,
                    error: error.message
                });
            }
        }

        console.log(`[CRON] Completed: ${results.sent} sent, ${results.skipped} skipped, ${results.failed} failed`);

        return res.status(200).json({
            message: 'Follow-up processing complete',
            ...results
        });

    } catch (error) {
        console.error('[CRON] Fatal error:', error);
        return res.status(500).json({ error: error.message });
    }
}

async function generateFollowUpMessage(followUp, conversation) {
    const name = conversation.participant_name?.split(' ')[0] || 'there';

    const templates = {
        best_time: `Hi ${name}! 👋 Just checking in - is there anything I can help you with today?`,
        intuition: `Hey ${name}! I noticed we haven't connected in a while. How's everything going?`,
        manual: `Hi ${name}! Following up on our conversation - let me know if you have any questions!`,
        reminder: `Hey ${name}! Just a friendly reminder about our conversation. Feel free to reach out anytime!`,
        flow: `Hi ${name}! Is there anything else I can assist you with?`
    };

    return templates[followUp.follow_up_type] || templates.manual;
}

async function sendMessage(pageId, recipientId, text, accessToken) {
    try {
        const response = await fetch(
            `https://graph.facebook.com/v18.0/${pageId}/messages?access_token=${accessToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: recipientId },
                    message: { text },
                    messaging_type: 'MESSAGE_TAG',
                    tag: 'CONFIRMED_EVENT_UPDATE' // Use appropriate tag for follow-ups
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            return { success: false, error: errorData.error?.message || 'Send failed' };
        }

        const result = await response.json();
        return { success: true, messageId: result.message_id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function markSent(db, followUpId, messageId) {
    await db
        .from('ai_followup_schedule')
        .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            sent_message_id: messageId,
            updated_at: new Date().toISOString()
        })
        .eq('id', followUpId);
}

async function markSkipped(db, followUpId, reason) {
    await db
        .from('ai_followup_schedule')
        .update({
            status: 'skipped',
            error_message: reason,
            updated_at: new Date().toISOString()
        })
        .eq('id', followUpId);
}

async function markFailed(db, followUpId, error) {
    // Get current retry count
    const { data } = await db
        .from('ai_followup_schedule')
        .select('retry_count, max_retries')
        .eq('id', followUpId)
        .single();

    const newRetryCount = (data?.retry_count || 0) + 1;
    const shouldRetry = newRetryCount < (data?.max_retries || 3);

    await db
        .from('ai_followup_schedule')
        .update({
            status: shouldRetry ? 'pending' : 'failed',
            retry_count: newRetryCount,
            error_message: error,
            // If retrying, delay by 1 hour
            scheduled_at: shouldRetry
                ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
                : undefined,
            updated_at: new Date().toISOString()
        })
        .eq('id', followUpId);
}

async function reschedule(db, followUpId, newTime) {
    await db
        .from('ai_followup_schedule')
        .update({
            scheduled_at: newTime.toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', followUpId);
}

export const config = {
    api: {
        bodyParser: true
    }
};
