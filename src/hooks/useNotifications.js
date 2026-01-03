import { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

export const useNotifications = (currentUserId) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUserId) {
      loadNotifications();
      // Poll for new notifications every 30 seconds
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUserId]);

  const loadNotifications = async () => {
    const client = getSupabaseClient();
    if (!client || !currentUserId) return;

    try {
      setLoading(true);
      const { data, error } = await client
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        // If table doesn't exist yet, just return empty
        if (error.code === '42P01') {
          console.warn('Notifications table not found. Run database migration.');
          setNotifications([]);
          setUnreadCount(0);
        } else {
          throw error;
        }
      } else {
        setNotifications(data || []);
        setUnreadCount(data?.length || 0);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNotification = async (notificationData) => {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      const { error } = await client
        .from('notifications')
        .insert({
          ...notificationData,
          user_id: currentUserId
        });

      if (error) throw error;
      loadNotifications(); // Refresh notifications
      return true;
    } catch (error) {
      console.error('Error creating notification:', error);
      return false;
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    loadNotifications,
    createNotification
  };
};

