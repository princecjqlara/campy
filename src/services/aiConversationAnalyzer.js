/**
 * AI Conversation Analyzer Service
 * Analyzes Facebook Messenger conversations for meetings, details, and generates notes
 */

import { nvidiaChat } from './aiService';

/**
 * Analyze a conversation for meeting intent
 * Returns: { hasMeeting: boolean, datetime: string|null, confidence: number }
 */
export const analyzeMeetingIntent = async (messages) => {
    const conversationText = messages
        .map(m => `${m.is_from_page ? 'Agent' : 'Contact'}: ${m.message_text}`)
        .join('\n');

    const systemPrompt = `You are analyzing a sales conversation for meeting scheduling intent.
Detect if a meeting has been discussed or scheduled.
Look for:
- Specific dates/times mentioned (e.g., "tomorrow at 2pm", "January 10", "next Monday")
- Scheduling language (e.g., "let's meet", "schedule a call", "book a meeting")
- Confirmation of meeting plans

Respond ONLY with JSON:
{
  "hasMeeting": true/false,
  "datetime": "YYYY-MM-DD HH:MM" or null if not specific,
  "confidence": 0.0-1.0,
  "rawTimeText": "the exact text mentioning time/date" or null
}`;

    const result = await nvidiaChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationText }
    ], { temperature: 0.3, maxTokens: 256 });

    try {
        const match = result?.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            return {
                hasMeeting: parsed.hasMeeting || false,
                datetime: parsed.datetime || null,
                confidence: parsed.confidence || 0,
                rawTimeText: parsed.rawTimeText || null
            };
        }
    } catch (e) {
        console.warn('Failed to parse meeting analysis:', e);
    }

    return { hasMeeting: false, datetime: null, confidence: 0, rawTimeText: null };
};

/**
 * Extract contact details from conversation
 * Returns: { facebookPage, businessName, phone, email, niche, website }
 */
export const extractContactDetails = async (messages, participantName) => {
    const conversationText = messages
        .map(m => `${m.is_from_page ? 'Agent' : 'Contact'}: ${m.message_text}`)
        .join('\n');

    const systemPrompt = `You are extracting business/contact details from a sales conversation.
The contact's name is: ${participantName || 'Unknown'}

Extract any of these details if mentioned:
- Facebook page URL or name
- Business/company name
- Phone number
- Email address
- Business niche/industry
- Website URL
- Any other contact information

Respond ONLY with JSON:
{
  "facebookPage": "url or name" or null,
  "businessName": "name" or null,
  "phone": "number" or null,
  "email": "email" or null,
  "niche": "industry/niche" or null,
  "website": "url" or null,
  "otherDetails": "any other relevant info" or null
}`;

    const result = await nvidiaChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationText }
    ], { temperature: 0.3, maxTokens: 512 });

    try {
        const match = result?.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
    } catch (e) {
        console.warn('Failed to parse contact details:', e);
    }

    return {
        facebookPage: null,
        businessName: null,
        phone: null,
        email: null,
        niche: null,
        website: null,
        otherDetails: null
    };
};

/**
 * Generate notes/summary from conversation
 */
export const generateNotes = async (messages, participantName) => {
    const conversationText = messages
        .map(m => `${m.is_from_page ? 'Agent' : 'Contact'}: ${m.message_text}`)
        .join('\n');

    const systemPrompt = `You are a sales assistant summarizing a conversation.
Create brief, actionable notes about this lead/contact.

Include:
- Key interests or needs expressed
- Pain points mentioned
- Budget indications
- Timeline/urgency
- Next steps discussed
- Any objections or concerns

Keep notes concise (2-4 bullet points). Use professional tone.`;

    const result = await nvidiaChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Contact: ${participantName || 'Unknown'}\n\nConversation:\n${conversationText}` }
    ], { temperature: 0.5, maxTokens: 512 });

    return result || '';
};

/**
 * Score/qualify a lead based on conversation
 * Returns: { score: 'hot'|'warm'|'cold', reason: string }
 */
export const qualifyLead = async (messages) => {
    const conversationText = messages
        .map(m => `${m.is_from_page ? 'Agent' : 'Contact'}: ${m.message_text}`)
        .join('\n');

    const systemPrompt = `You are a sales assistant qualifying leads.
Analyze the conversation and determine lead quality.

Score as:
- HOT: Ready to buy, mentioned budget, asked about pricing/packages, urgency
- WARM: Interested, asking questions, but no buying signals yet
- COLD: Just browsing, not responsive, unclear intent

Respond ONLY with JSON:
{
  "score": "hot" | "warm" | "cold",
  "reason": "brief explanation"
}`;

    const result = await nvidiaChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationText }
    ], { temperature: 0.3, maxTokens: 256 });

    try {
        const match = result?.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
    } catch (e) {
        console.warn('Failed to parse lead score:', e);
    }

    return { score: 'warm', reason: 'Unable to analyze' };
};

/**
 * Full conversation analysis - combines all analysis types
 */
export const analyzeConversation = async (messages, participantName) => {
    if (!messages || messages.length === 0) {
        return {
            meeting: { hasMeeting: false, datetime: null, confidence: 0 },
            details: {},
            notes: '',
            leadScore: { score: 'warm', reason: 'No messages to analyze' }
        };
    }

    // Run analyses in parallel for speed
    const [meeting, details, notes, leadScore] = await Promise.all([
        analyzeMeetingIntent(messages),
        extractContactDetails(messages, participantName),
        generateNotes(messages, participantName),
        qualifyLead(messages)
    ]);

    return {
        meeting,
        details,
        notes,
        leadScore,
        analyzedAt: new Date().toISOString()
    };
};

export default {
    analyzeMeetingIntent,
    extractContactDetails,
    generateNotes,
    qualifyLead,
    analyzeConversation
};
