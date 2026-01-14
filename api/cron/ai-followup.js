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
    // Verify cron authorization (optional - only checked if CRON_SECRET is set)
    const authHeader = req.headers.authorization;
    const vercelCron = req.headers['x-vercel-cron']; // Vercel's built-in cron header
    const cronSecret = process.env.CRON_SECRET;

    // Skip auth if Vercel cron OR if no secret is configured
    if (cronSecret && !vercelCron && authHeader !== `Bearer ${cronSecret}`) {
        console.log('[CRON] Unauthorized request - missing valid auth');
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
                    ai_enabled,
                    last_message_time
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
                    messageText = await generateFollowUpMessage(followUp, conversation, db);
                }

                // Send the message (pass last_message_time for 24h window check)
                const sendResult = await sendMessage(
                    page.page_id,
                    conversation.participant_id,
                    messageText,
                    page.page_access_token,
                    conversation.last_message_time
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

async function generateFollowUpMessage(followUp, conversation, db) {
    const name = conversation.participant_name?.split(' ')[0] || 'there';

    // Get admin-configured prompts from settings
    let adminConfig = {};
    try {
        const { data: settings } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();
        adminConfig = settings?.value || {};
    } catch (e) {
        console.log('[CRON] Could not load admin config, using defaults');
    }

    // Determine which prompt to use based on follow-up type
    let followUpPrompt = '';
    if (followUp.follow_up_type === 'initial' || followUp.follow_up_type === 'best_time') {
        followUpPrompt = adminConfig.followup_prompt_initial ||
            'Check in with the contact, remind them of what was discussed, and ask if they have any questions.';
    } else if (followUp.follow_up_type === 'second') {
        followUpPrompt = adminConfig.followup_prompt_second ||
            'Gently follow up, offer to schedule a call, and provide value by sharing relevant info about our services.';
    } else if (followUp.follow_up_type === 'reengagement' || followUp.follow_up_type === 'intuition') {
        followUpPrompt = adminConfig.followup_prompt_reengagement ||
            'Re-engage the contact with something new. Make them feel valued and not forgotten.';
    }

    // Check if AI-generated follow-ups are enabled
    if (adminConfig.ai_generated_followups) {
        // Get recent messages for context
        const { data: messages } = await db
            .from('facebook_messages')
            .select('message_text, is_from_page')
            .eq('conversation_id', followUp.conversation_id)
            .order('timestamp', { ascending: false })
            .limit(10);

        const recentMessages = (messages || []).reverse();
        const conversationContext = recentMessages
            .filter(m => m.message_text)
            .map(m => `${m.is_from_page ? 'You' : name}: ${m.message_text}`)
            .join('\n');

        // Generate AI message
        try {
            const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
            if (NVIDIA_API_KEY) {
                const aiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${NVIDIA_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'nvidia/llama-3.1-nemotron-70b-instruct',
                        messages: [
                            {
                                role: 'system',
                                content: `You are a friendly customer service AI. Generate a short, casual follow-up message for Facebook Messenger.
The contact's name is ${name}.

${adminConfig.knowledge_base ? `About the business:\n${adminConfig.knowledge_base.substring(0, 500)}` : ''}

Your task: ${followUpPrompt}

Recent conversation:
${conversationContext || 'No previous messages'}

Generate a friendly, concise follow-up message (1-2 sentences). Don't use placeholders.`
                            },
                            { role: 'user', content: 'Generate the follow-up message now.' }
                        ],
                        temperature: 0.7,
                        max_tokens: 150
                    })
                });

                if (aiResponse.ok) {
                    const aiData = await aiResponse.json();
                    const generatedMessage = aiData.choices?.[0]?.message?.content;
                    if (generatedMessage) {
                        console.log('[CRON] AI generated follow-up:', generatedMessage.substring(0, 50) + '...');
                        return generatedMessage.trim();
                    }
                }
            }
        } catch (e) {
            console.error('[CRON] AI generation failed, using template:', e.message);
        }
    }

    // Fallback to simple templates
    const templates = {
        initial: `Hi ${name}! 👋 Just checking in - is there anything I can help you with today?`,
        best_time: `Hi ${name}! 👋 Just checking in - is there anything I can help you with today?`,
        second: `Hey ${name}! 😊 I noticed we haven't connected in a bit. Would a quick call help answer your questions?`,
        intuition: `Hey ${name}! I noticed we haven't connected in a while. How's everything going?`,
        reengagement: `Hi ${name}! 🚀 We have some new offerings that might interest you. Want to hear more?`,
        manual: `Hi ${name}! Following up on our conversation - let me know if you have any questions!`,
        reminder: `Hey ${name}! Just a friendly reminder about our conversation. Feel free to reach out anytime!`,
        flow: `Hi ${name}! Is there anything else I can assist you with?`
    };

    return templates[followUp.follow_up_type] || templates.initial;
}

async function sendMessage(pageId, recipientId, text, accessToken, lastMessageTime = null) {
    try {
        // Check if we're outside the 24-hour window
        const now = new Date();
        let useMessageTag = false;
        let hourssinceLastActivity = 0;

        if (lastMessageTime) {
            const lastActivity = new Date(lastMessageTime);
            hourssinceLastActivity = (now - lastActivity) / (1000 * 60 * 60);
            // Facebook requires MESSAGE_TAG for messages sent >24 hours after last user message
            useMessageTag = hourssinceLastActivity > 24;
        }

        console.log(`[CRON] Sending message - Hours since last activity: ${hourssinceLastActivity.toFixed(1)}, Using tag: ${useMessageTag}`);

        // Build request body
        const requestBody = {
            recipient: { id: recipientId },
            message: { text }
        };

        // Add MESSAGE_TAG if outside 24-hour window
        if (useMessageTag) {
            requestBody.messaging_type = 'MESSAGE_TAG';
            requestBody.tag = 'ACCOUNT_UPDATE'; // Use ACCOUNT_UPDATE for follow-ups
            console.log(`[CRON] Using ACCOUNT_UPDATE tag for message (${hourssinceLastActivity.toFixed(1)}h since last activity)`);
        }

        const response = await fetch(
            `https://graph.facebook.com/v18.0/${pageId}/messages?access_token=${accessToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error?.message || 'Send failed';

            // Check if it's a 24-hour window error and we didn't use a tag
            if (errorMessage.includes('24 hour') && !useMessageTag) {
                console.log(`[CRON] Retrying with ACCOUNT_UPDATE tag due to 24h window error`);
                // Retry with tag
                return sendMessage(pageId, recipientId, text, accessToken, new Date(0).toISOString());
            }

            return { success: false, error: errorMessage };
        }

        const result = await response.json();
        return { success: true, messageId: result.message_id, usedTag: useMessageTag };
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
