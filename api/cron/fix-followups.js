import { createClient } from '@supabase/supabase-js';

/**
 * Debug endpoint to check and manage AI follow-up schedule
 * Shows status, failed records with errors, and can cleanup old records
 * Add ?cleanup=true to delete cancelled/old failed records
 */
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Supabase not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date().toISOString();
    const doCleanup = req.query.cleanup === 'true';

    try {
        let cleanupResults = null;

        // If cleanup requested, delete cancelled and old failed records
        if (doCleanup) {
            // Delete all cancelled records
            const { data: deletedCancelled } = await supabase
                .from('ai_followup_schedule')
                .delete()
                .eq('status', 'cancelled')
                .select('id');

            // Delete failed records older than 1 hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { data: deletedFailed } = await supabase
                .from('ai_followup_schedule')
                .delete()
                .eq('status', 'failed')
                .lt('created_at', oneHourAgo)
                .select('id');

            cleanupResults = {
                deletedCancelled: deletedCancelled?.length || 0,
                deletedFailed: deletedFailed?.length || 0
            };
        }

        // Count by status
        const { data: allRecords } = await supabase
            .from('ai_followup_schedule')
            .select('status');

        const statusCounts = {};
        for (const r of allRecords || []) {
            statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        }

        // Check failed records to see error messages
        const { data: failedRecords } = await supabase
            .from('ai_followup_schedule')
            .select('id, conversation_id, page_id, error_message, created_at')
            .eq('status', 'failed')
            .order('created_at', { ascending: false })
            .limit(5);

        // Check pending records
        const { data: pendingRecords } = await supabase
            .from('ai_followup_schedule')
            .select('id, conversation_id, scheduled_at, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(5);

        // Query what's currently due
        const { data: dueNow } = await supabase
            .from('ai_followup_schedule')
            .select('id')
            .eq('status', 'pending')
            .lte('scheduled_at', now);

        return res.status(200).json({
            currentTime: now,
            statusCounts,
            pendingCount: pendingRecords?.length || 0,
            pendingSample: pendingRecords?.slice(0, 3),
            dueNowCount: dueNow?.length || 0,
            failedCount: failedRecords?.length || 0,
            failedSample: failedRecords?.slice(0, 3).map(r => ({
                conversation_id: r.conversation_id,
                error: r.error_message
            })),
            cleanup: cleanupResults,
            tip: 'Add ?cleanup=true to delete cancelled and old failed records'
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
