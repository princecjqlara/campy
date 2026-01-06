import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * useClockInOut Hook
 * Manages user clock in/out status and shift tracking
 */
export const useClockInOut = (userId) => {
    const [isClockedIn, setIsClockedIn] = useState(false);
    const [currentShift, setCurrentShift] = useState(null);
    const [shiftDuration, setShiftDuration] = useState(0); // in minutes
    const [loading, setLoading] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState([]);

    // Calculate duration from clock in time
    const calculateDuration = useCallback((clockInTime) => {
        if (!clockInTime) return 0;
        const now = new Date();
        const clockIn = new Date(clockInTime);
        return Math.floor((now - clockIn) / (1000 * 60)); // minutes
    }, []);

    // Format duration for display
    const formatDuration = useCallback((minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    }, []);

    // Load current status
    const loadStatus = useCallback(async () => {
        if (!userId) return;

        const supabase = getSupabaseClient();
        if (!supabase) return;

        try {
            // Get user's current clock status
            const { data: user, error } = await supabase
                .from('users')
                .select('is_clocked_in, last_clock_in, current_shift_id')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error loading clock status:', error);
                return;
            }

            setIsClockedIn(user?.is_clocked_in || false);

            if (user?.is_clocked_in && user?.last_clock_in) {
                setCurrentShift({
                    id: user.current_shift_id,
                    clock_in: user.last_clock_in
                });
                setShiftDuration(calculateDuration(user.last_clock_in));
            }
        } catch (err) {
            console.error('Error in loadStatus:', err);
        }
    }, [userId, calculateDuration]);

    // Clock in
    const clockIn = useCallback(async () => {
        if (!userId) return { success: false, error: 'No user ID' };

        const supabase = getSupabaseClient();
        if (!supabase) return { success: false, error: 'No database connection' };

        setLoading(true);
        try {
            const now = new Date().toISOString();

            // Create new shift record
            const { data: shift, error: shiftError } = await supabase
                .from('user_shifts')
                .insert({
                    user_id: userId,
                    clock_in: now
                })
                .select()
                .single();

            if (shiftError) throw shiftError;

            // Update user status
            const { error: userError } = await supabase
                .from('users')
                .update({
                    is_clocked_in: true,
                    last_clock_in: now,
                    current_shift_id: shift.id
                })
                .eq('id', userId);

            if (userError) throw userError;

            setIsClockedIn(true);
            setCurrentShift(shift);
            setShiftDuration(0);

            return { success: true, shift };
        } catch (err) {
            console.error('Error clocking in:', err);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, [userId]);

    // Clock out
    const clockOut = useCallback(async () => {
        if (!userId || !currentShift) return { success: false, error: 'No active shift' };

        const supabase = getSupabaseClient();
        if (!supabase) return { success: false, error: 'No database connection' };

        setLoading(true);
        try {
            const now = new Date().toISOString();
            const duration = calculateDuration(currentShift.clock_in);

            // Update shift record
            const { error: shiftError } = await supabase
                .from('user_shifts')
                .update({
                    clock_out: now,
                    duration_minutes: duration
                })
                .eq('id', currentShift.id);

            if (shiftError) throw shiftError;

            // Update user status
            const { error: userError } = await supabase
                .from('users')
                .update({
                    is_clocked_in: false,
                    current_shift_id: null
                })
                .eq('id', userId);

            if (userError) throw userError;

            setIsClockedIn(false);
            setCurrentShift(null);
            setShiftDuration(0);

            return { success: true, duration };
        } catch (err) {
            console.error('Error clocking out:', err);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, [userId, currentShift, calculateDuration]);

    // Toggle clock in/out
    const toggle = useCallback(async () => {
        if (isClockedIn) {
            return await clockOut();
        } else {
            return await clockIn();
        }
    }, [isClockedIn, clockIn, clockOut]);

    // Get all online users (for admin)
    const loadOnlineUsers = useCallback(async () => {
        const supabase = getSupabaseClient();
        if (!supabase) return [];

        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, name, email, role, is_clocked_in, last_clock_in')
                .eq('is_clocked_in', true)
                .order('last_clock_in', { ascending: false });

            if (error) throw error;

            const usersWithDuration = (data || []).map(user => ({
                ...user,
                duration: calculateDuration(user.last_clock_in),
                durationFormatted: formatDuration(calculateDuration(user.last_clock_in))
            }));

            setOnlineUsers(usersWithDuration);
            return usersWithDuration;
        } catch (err) {
            console.error('Error loading online users:', err);
            return [];
        }
    }, [calculateDuration, formatDuration]);

    // Update duration every minute
    useEffect(() => {
        if (!isClockedIn || !currentShift?.clock_in) return;

        const interval = setInterval(() => {
            setShiftDuration(calculateDuration(currentShift.clock_in));
        }, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [isClockedIn, currentShift, calculateDuration]);

    // Load status on mount
    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    // Subscribe to realtime updates for online users
    useEffect(() => {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const subscription = supabase
            .channel('user_clock_status')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'users',
                filter: 'is_clocked_in=eq.true'
            }, () => {
                loadOnlineUsers();
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [loadOnlineUsers]);

    return {
        // State
        isClockedIn,
        currentShift,
        shiftDuration,
        shiftDurationFormatted: formatDuration(shiftDuration),
        loading,
        onlineUsers,

        // Actions
        clockIn,
        clockOut,
        toggle,
        loadOnlineUsers,
        refresh: loadStatus
    };
};

export default useClockInOut;
