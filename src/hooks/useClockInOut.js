import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../services/supabase';

/**
 * useClockInOut Hook
 * Manages user clock in/out status and shift tracking
 * Optimized to prevent UI flickering
 */
export const useClockInOut = (userId) => {
    const [isClockedIn, setIsClockedIn] = useState(false);
    const [currentShift, setCurrentShift] = useState(null);
    const [shiftDuration, setShiftDuration] = useState(0);
    const [loading, setLoading] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState([]);

    // Use refs to prevent unnecessary re-renders
    const isLoadingRef = useRef(false);
    const lastLoadRef = useRef(0);

    // Calculate duration from clock in time
    const calculateDuration = (clockInTime) => {
        if (!clockInTime) return 0;
        const now = new Date();
        const clockIn = new Date(clockInTime);
        return Math.floor((now - clockIn) / (1000 * 60));
    };

    // Format duration for display
    const formatDuration = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    // Load current status - stable function
    const loadStatus = useCallback(async () => {
        if (!userId) return;

        // Debounce: don't load if already loading or loaded recently
        const now = Date.now();
        if (isLoadingRef.current || (now - lastLoadRef.current) < 5000) return;

        isLoadingRef.current = true;
        lastLoadRef.current = now;

        const supabase = getSupabaseClient();
        if (!supabase) {
            isLoadingRef.current = false;
            return;
        }

        try {
            const { data: user, error } = await supabase
                .from('users')
                .select('is_clocked_in, last_clock_in, current_shift_id')
                .eq('id', userId)
                .single();

            if (error) {
                // Column might not exist yet
                if (error.code === '42703') {
                    console.log('Clock columns not yet available');
                    isLoadingRef.current = false;
                    return;
                }
                console.error('Error loading clock status:', error);
                isLoadingRef.current = false;
                return;
            }

            setIsClockedIn(user?.is_clocked_in || false);

            if (user?.is_clocked_in && user?.last_clock_in) {
                setCurrentShift({
                    id: user.current_shift_id,
                    clock_in: user.last_clock_in
                });
                setShiftDuration(calculateDuration(user.last_clock_in));
            } else {
                setCurrentShift(null);
                setShiftDuration(0);
            }
        } catch (err) {
            console.error('Error in loadStatus:', err);
        } finally {
            isLoadingRef.current = false;
        }
    }, [userId]);

    // Clock in
    const clockIn = useCallback(async () => {
        if (!userId) return { success: false, error: 'No user ID' };

        const supabase = getSupabaseClient();
        if (!supabase) return { success: false, error: 'No database connection' };

        setLoading(true);
        try {
            const now = new Date().toISOString();

            // Try to create shift record, ignore if table doesn't exist
            let shiftId = null;
            try {
                const { data: shift, error: shiftError } = await supabase
                    .from('user_shifts')
                    .insert({ user_id: userId, clock_in: now })
                    .select()
                    .single();

                if (!shiftError && shift) {
                    shiftId = shift.id;
                }
            } catch (e) {
                console.log('Shift table not available yet');
            }

            // Update user status
            const { error: userError } = await supabase
                .from('users')
                .update({
                    is_clocked_in: true,
                    last_clock_in: now,
                    current_shift_id: shiftId
                })
                .eq('id', userId);

            if (userError) throw userError;

            setIsClockedIn(true);
            setCurrentShift({ id: shiftId, clock_in: now });
            setShiftDuration(0);

            return { success: true };
        } catch (err) {
            console.error('Error clocking in:', err);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    }, [userId]);

    // Clock out
    const clockOut = useCallback(async () => {
        if (!userId) return { success: false, error: 'No user ID' };

        const supabase = getSupabaseClient();
        if (!supabase) return { success: false, error: 'No database connection' };

        setLoading(true);
        try {
            const now = new Date().toISOString();
            const duration = currentShift?.clock_in ? calculateDuration(currentShift.clock_in) : 0;

            // Update shift record if exists
            if (currentShift?.id) {
                try {
                    await supabase
                        .from('user_shifts')
                        .update({ clock_out: now, duration_minutes: duration })
                        .eq('id', currentShift.id);
                } catch (e) {
                    console.log('Could not update shift record');
                }
            }

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
    }, [userId, currentShift]);

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
    }, []);

    // Update duration every minute (only when clocked in)
    useEffect(() => {
        if (!isClockedIn || !currentShift?.clock_in) return;

        const interval = setInterval(() => {
            setShiftDuration(calculateDuration(currentShift.clock_in));
        }, 60000);

        return () => clearInterval(interval);
    }, [isClockedIn, currentShift?.clock_in]);

    // Load status on mount only
    useEffect(() => {
        loadStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    return {
        isClockedIn,
        currentShift,
        shiftDuration,
        shiftDurationFormatted: formatDuration(shiftDuration),
        loading,
        onlineUsers,
        clockIn,
        clockOut,
        toggle,
        loadOnlineUsers,
        refresh: loadStatus
    };
};

export default useClockInOut;
