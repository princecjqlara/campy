/**
 * Follow-Up Scheduler Service
 * Intelligent follow-up scheduling with Best Time to Contact model
 * Module 2 of the Enterprise AI Chatbot System
 */

import { getSupabaseClient } from './supabase';
import { checkSafetyStatus, logSafetyEvent } from './safetyLayer';
import { getActiveGoal } from './goalController';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Best Time to Contact result
 * @typedef {Object} BestTimeResult
 * @property {number} dayOfWeek - Best day (0-6, Sun-Sat)
 * @property {number} hourOfDay - Best hour (0-23)
 * @property {number} confidence - Confidence in prediction (0-1)
 * @property {Date} nextBestTime - Next occurrence of best time
 */

/**
 * Calculate the best time to contact a specific conversation
 * Based on historical engagement data
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<BestTimeResult>}
 */
export async function calculateBestTimeToContact(conversationId) {
    try {
        const db = getSupabase();

        // Get engagement history
        const { data: engagements, error } = await db
            .from('contact_engagement')
            .select('day_of_week, hour_of_day, response_latency_seconds, engagement_score')
            .eq('conversation_id', conversationId)
            .eq('message_direction', 'inbound') // Focus on when they respond
            .order('message_timestamp', { ascending: false })
            .limit(50);

        if (error) throw error;

        // If no engagement data, use defaults
        if (!engagements || engagements.length < 3) {
            return getDefaultBestTime();
        }

        // Calculate weighted scores for each day/hour combination
        const timeScores = {};

        for (const eng of engagements) {
            const key = `${eng.day_of_week}-${eng.hour_of_day}`;

            if (!timeScores[key]) {
                timeScores[key] = {
                    dayOfWeek: eng.day_of_week,
                    hourOfDay: eng.hour_of_day,
                    count: 0,
                    totalLatency: 0,
                    totalScore: 0
                };
            }

            timeScores[key].count++;
            timeScores[key].totalLatency += eng.response_latency_seconds || 0;
            timeScores[key].totalScore += eng.engagement_score || 1;
        }

        // Find best time slot
        let bestSlot = null;
        let bestRating = -Infinity;

        for (const [key, slot] of Object.entries(timeScores)) {
            // Rating formula: high response count + low latency + high engagement
            const avgLatency = slot.totalLatency / slot.count;
            const avgScore = slot.totalScore / slot.count;

            // Normalize latency (lower is better, max 1 hour considered)
            const latencyFactor = Math.max(0, 1 - (avgLatency / 3600));

            // Combined rating
            const rating = (slot.count * 0.3) + (latencyFactor * 0.4) + (avgScore * 0.3);

            if (rating > bestRating) {
                bestRating = rating;
                bestSlot = slot;
            }
        }

        if (!bestSlot) {
            return getDefaultBestTime();
        }

        // Calculate next occurrence of best time
        const nextBestTime = getNextOccurrence(bestSlot.dayOfWeek, bestSlot.hourOfDay);

        // Calculate confidence based on data quality
        const confidence = Math.min(engagements.length / 20, 1) * 0.8 + 0.2;

        return {
            dayOfWeek: bestSlot.dayOfWeek,
            hourOfDay: bestSlot.hourOfDay,
            confidence,
            nextBestTime,
            dataPoints: engagements.length
        };

    } catch (error) {
        console.error('[SCHEDULER] Error calculating best time:', error);
        return getDefaultBestTime();
    }
}

/**
 * Get default best time (business hours)
 */
function getDefaultBestTime() {
    const now = new Date();
    let nextBestTime = new Date(now);

    // Default: Next weekday at 10 AM
    nextBestTime.setHours(10, 0, 0, 0);

    // If it's already past 10 AM or weekend, find next weekday
    if (now.getHours() >= 10 || now.getDay() === 0 || now.getDay() === 6) {
        nextBestTime.setDate(nextBestTime.getDate() + 1);
        while (nextBestTime.getDay() === 0 || nextBestTime.getDay() === 6) {
            nextBestTime.setDate(nextBestTime.getDate() + 1);
        }
    }

    return {
        dayOfWeek: 1, // Monday
        hourOfDay: 10, // 10 AM
        confidence: 0.3, // Low confidence (no data)
        nextBestTime,
        dataPoints: 0
    };
}

/**
 * Get next occurrence of a specific day/hour
 */
function getNextOccurrence(dayOfWeek, hourOfDay) {
    const now = new Date();
    const result = new Date(now);

    // Set the hour
    result.setHours(hourOfDay, 0, 0, 0);

    // Calculate days until target day
    let daysUntil = dayOfWeek - now.getDay();
    if (daysUntil < 0 || (daysUntil === 0 && now.getHours() >= hourOfDay)) {
        daysUntil += 7;
    }

    result.setDate(result.getDate() + daysUntil);
    return result;
}

/**
 * Schedule a follow-up for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Scheduling options
 */
export async function scheduleFollowUp(conversationId, options = {}) {
    try {
        const db = getSupabase();

        const {
            type = 'manual',
            scheduledAt = null,
            message = null,
            reason = null,
            goalId = null,
            useBestTime = false,
            delayHours = null,
            userId = null
        } = options;

        // Check safety status
        const safety = await checkSafetyStatus(conversationId);
        if (safety.optedOut) {
            return {
                success: false,
                error: 'Contact has opted out',
                reason: 'opted_out'
            };
        }

        // Get conversation for page_id
        const { data: conv } = await db
            .from('facebook_conversations')
            .select('page_id, cooldown_until')
            .eq('conversation_id', conversationId)
            .single();

        if (!conv) {
            throw new Error('Conversation not found');
        }

        // Determine scheduled time
        let targetTime;
        if (scheduledAt) {
            targetTime = new Date(scheduledAt);
        } else if (useBestTime) {
            const bestTime = await calculateBestTimeToContact(conversationId);
            targetTime = bestTime.nextBestTime;
        } else if (delayHours) {
            targetTime = new Date();
            targetTime.setHours(targetTime.getHours() + delayHours);
        } else {
            // Default: 4 hours from now
            targetTime = new Date();
            targetTime.setHours(targetTime.getHours() + 4);
        }

        // Ensure scheduled time respects cooldown
        if (conv.cooldown_until) {
            const cooldownEnd = new Date(conv.cooldown_until);
            if (targetTime < cooldownEnd) {
                targetTime = cooldownEnd;
            }
        }

        // Check for existing pending follow-ups
        const { data: existing } = await db
            .from('ai_followup_schedule')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('status', 'pending');

        // Cancel existing if scheduling new
        if (existing && existing.length > 0) {
            await db
                .from('ai_followup_schedule')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('conversation_id', conversationId)
                .eq('status', 'pending');
        }

        // Create new follow-up
        const { data: followUp, error } = await db
            .from('ai_followup_schedule')
            .insert({
                conversation_id: conversationId,
                page_id: conv.page_id,
                scheduled_at: targetTime.toISOString(),
                follow_up_type: type,
                reason,
                message_template: message,
                goal_id: goalId,
                status: 'pending',
                cooldown_until: conv.cooldown_until,
                created_by: userId
            })
            .select()
            .single();

        if (error) throw error;

        // Log action
        await logSafetyEvent({
            conversationId,
            pageId: conv.page_id,
            actionType: 'followup_scheduled',
            data: {
                followUpId: followUp.id,
                scheduledAt: targetTime.toISOString(),
                type,
                reason
            },
            explanation: `Follow-up scheduled for ${targetTime.toLocaleString()}`,
            goalId
        });

        console.log(`[SCHEDULER] Scheduled ${type} follow-up for ${conversationId} at ${targetTime}`);

        return {
            success: true,
            followUp,
            scheduledAt: targetTime
        };

    } catch (error) {
        console.error('[SCHEDULER] Error scheduling follow-up:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get scheduled follow-ups for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Query options
 */
export async function getScheduledFollowUps(conversationId, options = {}) {
    try {
        const db = getSupabase();
        const { includeAll = false, limit = 10 } = options;

        let query = db
            .from('ai_followup_schedule')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('scheduled_at', { ascending: true })
            .limit(limit);

        if (!includeAll) {
            query = query.eq('status', 'pending');
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];

    } catch (error) {
        console.error('[SCHEDULER] Error getting follow-ups:', error);
        return [];
    }
}

/**
 * Get all pending follow-ups (for cron processing)
 * @param {Date} beforeTime - Get follow-ups scheduled before this time
 */
export async function getPendingFollowUps(beforeTime = null) {
    try {
        const db = getSupabase();
        const targetTime = beforeTime || new Date();

        const { data, error } = await db
            .from('ai_followup_schedule')
            .select(`
                *,
                conversation:conversation_id(
                    participant_id,
                    participant_name,
                    human_takeover,
                    opt_out,
                    cooldown_until
                ),
                page:page_id(
                    page_access_token,
                    page_name
                ),
                goal:goal_id(
                    goal_type,
                    goal_prompt
                )
            `)
            .eq('status', 'pending')
            .lte('scheduled_at', targetTime.toISOString())
            .order('scheduled_at', { ascending: true })
            .limit(50);

        if (error) throw error;
        return data || [];

    } catch (error) {
        console.error('[SCHEDULER] Error getting pending follow-ups:', error);
        return [];
    }
}

/**
 * Cancel a scheduled follow-up
 * @param {string} followUpId - Follow-up ID
 * @param {string} reason - Cancellation reason
 */
export async function cancelFollowUp(followUpId, reason = null) {
    try {
        const db = getSupabase();

        const { data: followUp, error: fetchError } = await db
            .from('ai_followup_schedule')
            .select('conversation_id, follow_up_type')
            .eq('id', followUpId)
            .single();

        if (fetchError) throw fetchError;

        const { error } = await db
            .from('ai_followup_schedule')
            .update({
                status: 'cancelled',
                error_message: reason,
                updated_at: new Date().toISOString()
            })
            .eq('id', followUpId);

        if (error) throw error;

        await logSafetyEvent({
            conversationId: followUp.conversation_id,
            actionType: 'followup_cancelled',
            data: { followUpId, reason },
            explanation: reason ? `Follow-up cancelled: ${reason}` : 'Follow-up cancelled'
        });

        return { success: true };

    } catch (error) {
        console.error('[SCHEDULER] Error cancelling follow-up:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Mark a follow-up as sent
 * @param {string} followUpId - Follow-up ID
 * @param {string} messageId - Sent message ID
 */
export async function markFollowUpSent(followUpId, messageId = null) {
    try {
        const db = getSupabase();

        const { error } = await db
            .from('ai_followup_schedule')
            .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                sent_message_id: messageId,
                updated_at: new Date().toISOString()
            })
            .eq('id', followUpId);

        if (error) throw error;
        return { success: true };

    } catch (error) {
        console.error('[SCHEDULER] Error marking follow-up sent:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Mark a follow-up as failed
 * @param {string} followUpId - Follow-up ID
 * @param {string} errorMessage - Error message
 */
export async function markFollowUpFailed(followUpId, errorMessage) {
    try {
        const db = getSupabase();

        const { data: followUp } = await db
            .from('ai_followup_schedule')
            .select('retry_count, max_retries')
            .eq('id', followUpId)
            .single();

        const newRetryCount = (followUp?.retry_count || 0) + 1;
        const shouldRetry = newRetryCount < (followUp?.max_retries || 3);

        const { error } = await db
            .from('ai_followup_schedule')
            .update({
                status: shouldRetry ? 'pending' : 'failed',
                retry_count: newRetryCount,
                error_message: errorMessage,
                // If retrying, delay by 1 hour
                scheduled_at: shouldRetry
                    ? new Date(Date.now() + 3600000).toISOString()
                    : undefined,
                updated_at: new Date().toISOString()
            })
            .eq('id', followUpId);

        if (error) throw error;

        return {
            success: true,
            willRetry: shouldRetry,
            retryCount: newRetryCount
        };

    } catch (error) {
        console.error('[SCHEDULER] Error marking follow-up failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Record engagement data for Best Time calculation
 * @param {Object} data - Engagement data
 */
export async function recordEngagement(data) {
    try {
        const db = getSupabase();

        const {
            conversationId,
            participantId,
            pageId,
            messageTimestamp,
            direction,
            responseLatency = null
        } = data;

        const timestamp = new Date(messageTimestamp);

        const { error } = await db
            .from('contact_engagement')
            .insert({
                conversation_id: conversationId,
                participant_id: participantId,
                page_id: pageId,
                message_timestamp: timestamp.toISOString(),
                message_direction: direction,
                response_latency_seconds: responseLatency,
                day_of_week: timestamp.getDay(),
                hour_of_day: timestamp.getHours(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });

        if (error) throw error;
        return { success: true };

    } catch (error) {
        console.error('[SCHEDULER] Error recording engagement:', error);
        return { success: false };
    }
}

/**
 * Get engagement analytics for a contact
 * @param {string} conversationId - Conversation ID
 */
export async function getEngagementAnalytics(conversationId) {
    try {
        const db = getSupabase();

        const { data, error } = await db
            .from('contact_engagement')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('message_timestamp', { ascending: false })
            .limit(100);

        if (error) throw error;

        if (!data || data.length === 0) {
            return { hasData: false };
        }

        // Calculate analytics
        const inbound = data.filter(e => e.message_direction === 'inbound');
        const avgLatency = inbound.reduce((sum, e) => sum + (e.response_latency_seconds || 0), 0) / inbound.length;

        // Most active hours
        const hourCounts = {};
        for (const e of inbound) {
            hourCounts[e.hour_of_day] = (hourCounts[e.hour_of_day] || 0) + 1;
        }
        const topHours = Object.entries(hourCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }));

        // Most active days
        const dayCounts = {};
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        for (const e of inbound) {
            dayCounts[e.day_of_week] = (dayCounts[e.day_of_week] || 0) + 1;
        }
        const topDays = Object.entries(dayCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([day, count]) => ({ day: dayNames[parseInt(day)], count }));

        return {
            hasData: true,
            totalMessages: data.length,
            inboundMessages: inbound.length,
            avgResponseLatencySeconds: Math.round(avgLatency),
            avgResponseLatencyMinutes: Math.round(avgLatency / 60),
            topHours,
            topDays,
            timezone: data[0]?.timezone || 'Unknown'
        };

    } catch (error) {
        console.error('[SCHEDULER] Error getting analytics:', error);
        return { hasData: false, error: error.message };
    }
}

export default {
    calculateBestTimeToContact,
    scheduleFollowUp,
    getScheduledFollowUps,
    getPendingFollowUps,
    cancelFollowUp,
    markFollowUpSent,
    markFollowUpFailed,
    recordEngagement,
    getEngagementAnalytics
};
