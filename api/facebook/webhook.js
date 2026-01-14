import { createClient } from '@supabase/supabase-js';

// Lazy-load Supabase client to prevent initialization errors
let supabase = null;
function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!url || !key) {
            console.error('[WEBHOOK] Supabase URL or key not configured');
            return null;
        }
        supabase = createClient(url, key);
    }
    return supabase;
}

/**
 * Fetch Facebook user profile name using Graph API
 * Note: Facebook restricts profile access - the user must have messaged the page
 * and your app needs appropriate permissions (pages_messaging)
 */
async function fetchFacebookUserName(userId, pageId) {
    const db = getSupabase();
    if (!db) {
        console.log('[WEBHOOK] No database connection for name lookup');
        return null;
    }

    try {
        // Get page access token from database
        const { data: page, error: pageError } = await db
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', pageId)
            .single();

        if (pageError) {
            console.error('[WEBHOOK] Error fetching page token:', pageError.message);
            return null;
        }

        if (!page?.page_access_token) {
            console.log('[WEBHOOK] No page access token available for user name lookup');
            return null;
        }

        // Try to fetch user profile from Facebook using PSID
        // This requires that the user has messaged your page
        const url = `https://graph.facebook.com/v18.0/${userId}?fields=name,first_name,last_name&access_token=${page.page_access_token}`;
        console.log(`[WEBHOOK] Fetching user profile for PSID: ${userId}`);

        const response = await fetch(url);
        const responseText = await response.text();

        console.log(`[WEBHOOK] Facebook API response status: ${response.status}`);

        if (!response.ok) {
            // Log the full error for debugging
            console.error('[WEBHOOK] Facebook API error response:', responseText);

            // Check if it's a permission error
            try {
                const errorData = JSON.parse(responseText);
                if (errorData.error?.code === 100) {
                    console.log('[WEBHOOK] User profile not accessible - Facebook privacy/permission restriction');
                } else if (errorData.error?.code === 190) {
                    console.error('[WEBHOOK] Page access token may be expired or invalid');
                } else {
                    console.error('[WEBHOOK] Facebook error:', errorData.error?.message);
                }
            } catch (e) {
                console.error('[WEBHOOK] Could not parse error response');
            }
            return null;
        }

        try {
            const profile = JSON.parse(responseText);
            const userName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

            if (userName) {
                console.log(`[WEBHOOK] Successfully fetched user name: ${userName}`);
                return userName;
            } else {
                console.log('[WEBHOOK] Profile returned but no name fields available');
                return null;
            }
        } catch (parseError) {
            console.error('[WEBHOOK] Error parsing profile response:', parseError.message);
            return null;
        }
    } catch (err) {
        console.error('[WEBHOOK] Exception fetching user name:', err.message);
        return null;
    }
}

/**
 * Facebook Webhook Handler
 * Handles both verification (GET) and incoming messages (POST)
 */
export default async function handler(req, res) {
    try {
        // Handle GET request for webhook verification
        if (req.method === 'GET') {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];

            const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'TEST_TOKEN';

            console.log('[WEBHOOK] Verification attempt:', { mode, token, expectedToken: verifyToken });

            if (mode === 'subscribe' && token === verifyToken) {
                console.log('[WEBHOOK] Verified successfully');
                return res.status(200).send(challenge);
            } else {
                console.log('[WEBHOOK] Verification failed');
                return res.status(403).json({ error: 'Verification failed' });
            }
        }

        // Handle POST request for incoming messages
        if (req.method === 'POST') {
            const body = req.body;

            console.log('[WEBHOOK] POST received:', JSON.stringify(body, null, 2));

            // Check if this is a page subscription
            if (body.object === 'page') {
                // Process each entry
                for (const entry of body.entry || []) {
                    const pageId = entry.id;
                    const messaging = entry.messaging || [];

                    for (const event of messaging) {
                        try {
                            // Handle incoming message
                            if (event.message) {
                                await handleIncomingMessage(pageId, event);
                            }

                            // Handle message delivery
                            if (event.delivery) {
                                console.log('[WEBHOOK] Message delivered:', event.delivery);
                            }

                            // Handle message read
                            if (event.read) {
                                console.log('[WEBHOOK] Message read:', event.read);
                            }
                        } catch (error) {
                            console.error('[WEBHOOK] Error processing event:', error);
                        }
                    }
                }

                return res.status(200).json({ status: 'ok' });
            }

            return res.status(200).json({ status: 'ignored' });
        }

        // Method not allowed
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[WEBHOOK] Handler error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}

/**
 * Handle incoming message from user (or echo from page)
 */
async function handleIncomingMessage(pageId, event) {
    const senderId = event.sender?.id;
    const recipientId = event.recipient?.id;
    const message = event.message;
    const timestamp = event.timestamp;

    if (!senderId || !message) {
        console.log('[WEBHOOK] Missing sender or message');
        return;
    }

    // Check if this is an echo (message sent FROM the page, not received)
    const isEcho = message.is_echo === true;

    // For echoes: sender is the page, recipient is the user
    // For regular messages: sender is the user, recipient is the page
    const participantId = isEcho ? recipientId : senderId;
    const isFromPage = isEcho;

    console.log(`[WEBHOOK] ${isEcho ? 'Echo' : 'Incoming'} message, participant: ${participantId}:`, message.text || '[attachment]');

    const db = getSupabase();
    if (!db) {
        console.error('[WEBHOOK] Database not configured, skipping save');
        return;
    }

    // Find or create conversation - look up by participant_id first (matches synced conversations)
    try {
        const { data: existingConv, error: fetchError } = await db
            .from('facebook_conversations')
            .select('*')
            .eq('participant_id', participantId)
            .eq('page_id', pageId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('[WEBHOOK] Error fetching existing conversation:', fetchError);
        }

        // Use existing conversation_id or create temporary one for new conversations
        const conversationId = existingConv?.conversation_id || `t_${participantId}`;

        // Only increment unread for messages FROM the user, not echoes
        const newUnreadCount = isFromPage ? (existingConv?.unread_count || 0) : (existingConv?.unread_count || 0) + 1;

        // Try multiple sources for participant name
        let participantName = existingConv?.participant_name;

        // Fetch name if missing (for both incoming messages AND echoes)
        if (!participantName) {
            // Source 1: Check if Facebook included sender name in the event (some configurations do)
            const senderNameFromEvent = event.sender?.name || event.recipient?.name || message.sender_name;
            if (senderNameFromEvent) {
                console.log(`[WEBHOOK] Got name from event: ${senderNameFromEvent}`);
                participantName = senderNameFromEvent;
            }

            // Source 2: Try to fetch from Facebook Graph API
            if (!participantName) {
                console.log(`[WEBHOOK] Fetching name from API for participant: ${participantId}`);
                participantName = await fetchFacebookUserName(participantId, pageId);
            }

            if (participantName) {
                console.log(`[WEBHOOK] Name resolved: ${participantName}`);
            } else {
                console.log(`[WEBHOOK] Could not resolve name for ${participantId}`);
            }
        }


        // Upsert conversation with incremented unread count
        // Use participant_id + page_id as conflict key to prevent duplicate contacts
        const { error: convError } = await db
            .from('facebook_conversations')
            .upsert({
                conversation_id: conversationId,
                page_id: pageId,
                participant_id: participantId,
                participant_name: participantName || null,
                last_message_text: message.text || '[Attachment]',
                last_message_time: new Date(timestamp).toISOString(),
                last_message_from_page: isFromPage,
                unread_count: newUnreadCount,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'participant_id,page_id',
                ignoreDuplicates: false
            });

        if (convError) {
            console.error('[WEBHOOK] Error upserting conversation:', convError);
        } else {
            console.log(`[WEBHOOK] Conversation ${conversationId} updated, unread: ${newUnreadCount}`);
        }

        // Save message
        // For echoes (messages from page), check if already saved by app
        let sentSource = null;
        if (isFromPage) {
            // Check if this message was already saved by the app (sent via Campy)
            const { data: existingMsg } = await db
                .from('facebook_messages')
                .select('sent_source')
                .eq('message_id', message.mid)
                .single();

            if (existingMsg?.sent_source === 'app') {
                // Already saved by app, don't overwrite sent_source
                sentSource = 'app';
                console.log(`[WEBHOOK] Message ${message.mid} was sent via app`);
            } else {
                // Not sent via app = sent via Facebook Business Suite
                sentSource = 'business_suite';
                console.log(`[WEBHOOK] Message ${message.mid} was sent via Facebook Business Suite`);
            }
        }

        const { error: msgError } = await db
            .from('facebook_messages')
            .upsert({
                message_id: message.mid,
                conversation_id: conversationId,
                sender_id: senderId,
                message_text: message.text || null,
                attachments: message.attachments || null,
                timestamp: new Date(timestamp).toISOString(),
                is_from_page: isFromPage,
                is_read: isFromPage, // Echo messages are already "read"
                sent_source: sentSource
            }, { onConflict: 'message_id' });

        if (msgError) {
            console.error('[WEBHOOK] Error saving message:', msgError);
        } else {
            console.log(`[WEBHOOK] Message ${message.mid} saved successfully`);
        }

        // TRIGGER AI AUTO-RESPONSE for incoming messages (not echoes)
        if (!isFromPage && message.text) {
            console.log('[WEBHOOK] Triggering AI auto-response check...');
            await triggerAIResponse(db, conversationId, pageId, existingConv);
        }
    } catch (error) {
        console.error('[WEBHOOK] Exception in handleIncomingMessage:', error);
    }
}

/**
 * Trigger AI auto-response for a conversation
 */
async function triggerAIResponse(db, conversationId, pageId, conversation) {
    try {
        console.log('[WEBHOOK] === AI AUTO-RESPONSE CHECK ===');
        console.log('[WEBHOOK] Conversation ID:', conversationId);
        console.log('[WEBHOOK] Page ID:', pageId);
        console.log('[WEBHOOK] Conversation data:', JSON.stringify({
            ai_enabled: conversation?.ai_enabled,
            human_takeover: conversation?.human_takeover,
            cooldown_until: conversation?.cooldown_until,
            participant_name: conversation?.participant_name
        }));

        // Check if AI is enabled globally (from settings)
        const { data: settings, error: settingsError } = await db
            .from('settings')
            .select('value')
            .eq('key', 'ai_chatbot_config')
            .single();

        if (settingsError) {
            console.log('[WEBHOOK] Settings fetch error (may not exist yet):', settingsError.message);
        }

        const config = settings?.value || {};
        console.log('[WEBHOOK] AI Config:', JSON.stringify({
            auto_respond: config.auto_respond_to_new_messages,
            hasKnowledgeBase: !!config.knowledge_base,
            hasSystemPrompt: !!config.system_prompt
        }));

        // Check if auto-respond is enabled (default: TRUE - enabled unless explicitly disabled)
        if (config.auto_respond_to_new_messages === false) {
            console.log('[WEBHOOK] ❌ AI auto-respond is disabled globally');
            return;
        }

        // Check if AI is enabled for this specific conversation (default: TRUE)
        // Only skip if explicitly set to false
        if (conversation?.ai_enabled === false) {
            console.log('[WEBHOOK] ❌ AI is disabled for this conversation');
            return;
        }

        // Check if in human takeover mode
        if (conversation?.human_takeover === true) {
            console.log('[WEBHOOK] ❌ Conversation is in human takeover mode');
            return;
        }

        // Check cooldown
        if (conversation?.cooldown_until) {
            const cooldownUntil = new Date(conversation.cooldown_until);
            if (cooldownUntil > new Date()) {
                console.log(`[WEBHOOK] ❌ AI on cooldown until ${cooldownUntil.toISOString()}`);
                return;
            }
        }

        console.log('[WEBHOOK] ✅ All checks passed, proceeding with AI response');

        // Get page access token
        const { data: page, error: pageError } = await db
            .from('facebook_pages')
            .select('page_access_token')
            .eq('page_id', pageId)
            .single();

        if (pageError) {
            console.error('[WEBHOOK] ❌ Page fetch error:', pageError.message);
            return;
        }

        if (!page?.page_access_token) {
            console.error('[WEBHOOK] ❌ No page access token found');
            return;
        }

        console.log('[WEBHOOK] ✅ Page access token found');

        // Get recent messages for context
        const { data: messages } = await db
            .from('facebook_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: false })
            .limit(20);

        const recentMessages = (messages || []).reverse();

        // Get knowledge base from settings
        const knowledgeBase = config.knowledge_base || '';
        const systemPrompt = config.system_prompt || 'You are a friendly AI assistant.';
        const botRulesDos = config.bot_rules_dos || '';
        const botRulesDonts = config.bot_rules_donts || '';
        const bookingUrl = config.booking_url || '';

        // Build AI prompt
        const aiSystemPrompt = buildAIPrompt({
            systemPrompt,
            knowledgeBase,
            botRulesDos,
            botRulesDonts,
            bookingUrl,
            participantName: conversation?.participant_name,
            extractedDetails: conversation?.extracted_details,
            summary: conversation?.summary
        });

        // Format messages for AI
        const aiMessages = [
            { role: 'system', content: aiSystemPrompt }
        ];

        for (const msg of recentMessages) {
            const role = msg.is_from_page ? 'assistant' : 'user';
            const content = msg.message_text || '[Attachment]';
            aiMessages.push({ role, content });
        }

        // Call NVIDIA AI API
        const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || process.env.VITE_NVIDIA_API_KEY;
        if (!NVIDIA_API_KEY) {
            console.error('[WEBHOOK] NVIDIA API key not configured');
            return;
        }

        console.log('[WEBHOOK] Calling NVIDIA AI...');
        const aiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NVIDIA_API_KEY}`
            },
            body: JSON.stringify({
                model: 'nvidia/llama-3.1-nemotron-70b-instruct',
                messages: aiMessages,
                temperature: 0.7,
                max_tokens: 500
            })
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error('[WEBHOOK] NVIDIA API error:', errorText);
            return;
        }

        const aiData = await aiResponse.json();
        const aiReply = aiData.choices?.[0]?.message?.content;

        if (!aiReply) {
            console.error('[WEBHOOK] No AI reply generated');
            return;
        }

        console.log('[WEBHOOK] AI Reply:', aiReply.substring(0, 100) + '...');

        // Send via Facebook Messenger API
        const participantId = conversation?.participant_id || conversationId.replace('t_', '');
        const sendResponse = await fetch(
            `https://graph.facebook.com/v18.0/${pageId}/messages?access_token=${page.page_access_token}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: participantId },
                    message: { text: aiReply },
                    messaging_type: 'RESPONSE'
                })
            }
        );

        if (!sendResponse.ok) {
            const sendError = await sendResponse.text();
            console.error('[WEBHOOK] Failed to send AI reply:', sendError);
            return;
        }

        const sendResult = await sendResponse.json();
        console.log('[WEBHOOK] AI reply sent successfully:', sendResult.message_id);

        // Set cooldown (default 4 hours)
        const cooldownHours = config.default_cooldown_hours || 4;
        const cooldownUntil = new Date(Date.now() + cooldownHours * 60 * 60 * 1000);

        await db
            .from('facebook_conversations')
            .update({
                cooldown_until: cooldownUntil.toISOString(),
                last_ai_message_time: new Date().toISOString()
            })
            .eq('conversation_id', conversationId);

        console.log(`[WEBHOOK] Cooldown set until ${cooldownUntil.toISOString()}`);

    } catch (error) {
        console.error('[WEBHOOK] Error in AI auto-response:', error);
    }
}

/**
 * Build AI system prompt from config
 */
function buildAIPrompt({ systemPrompt, knowledgeBase, botRulesDos, botRulesDonts, bookingUrl, participantName, extractedDetails, summary }) {
    let prompt = `## Role and Personality:
${systemPrompt}

## Context:
- Platform: Facebook Messenger
- Contact Name: ${participantName || 'Unknown'}
`;

    if (knowledgeBase) {
        prompt += `\n## Knowledge Base:\n${knowledgeBase}\n`;
    }

    if (extractedDetails && Object.keys(extractedDetails).length > 0) {
        prompt += '\n## Customer Details:';
        if (extractedDetails.businessName) prompt += `\n- Business: ${extractedDetails.businessName}`;
        if (extractedDetails.niche) prompt += `\n- Industry: ${extractedDetails.niche}`;
        if (extractedDetails.phone) prompt += `\n- Phone: ${extractedDetails.phone}`;
        if (extractedDetails.email) prompt += `\n- Email: ${extractedDetails.email}`;
        prompt += '\n';
    }

    if (summary) {
        prompt += `\n## Conversation Summary:\n${summary}\n`;
    }

    if (botRulesDos) {
        prompt += `\n## DO's:\n${botRulesDos}\n`;
    }

    if (botRulesDonts) {
        prompt += `\n## DON'Ts:\n${botRulesDonts}\n`;
    }

    if (bookingUrl) {
        prompt += `\n## Booking Link:\nShare this when customer wants to book: ${bookingUrl}\n`;
    }

    prompt += `\n## Important:
- Keep responses concise (this is chat, not email)
- If unsure, say you'll have the team follow up
`;

    return prompt;
}

// Vercel config
export const config = {
    api: {
        bodyParser: true
    }
};
