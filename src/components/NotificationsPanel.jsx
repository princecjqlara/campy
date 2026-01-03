import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

const NotificationsPanel = ({ isOpen, onClose, currentUserId }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unread, read

  useEffect(() => {
    if (isOpen && currentUserId) {
      loadNotifications();
    }
  }, [isOpen, currentUserId, filter]);

  const loadNotifications = async () => {
    const client = getSupabaseClient();
    if (!client || !currentUserId) return;

    try {
      setLoading(true);
      let query = client
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter === 'unread') {
        query = query.eq('read', false);
      } else if (filter === 'read') {
        query = query.eq('read', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { error } = await client
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    const client = getSupabaseClient();
    if (!client || !currentUserId) return;

    try {
      const { error } = await client
        .from('notifications')
        .update({ read: true })
        .eq('user_id', currentUserId)
        .eq('read', false);

      if (error) throw error;
      loadNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const deleteNotification = async (notificationId) => {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { error } = await client
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const getNotificationIcon = (type) => {
    const icons = {
      payment_due: '💰',
      payment_overdue: '⚠️',
      phase_transition: '🔄',
      milestone: '🎯',
      testing_complete: '✅',
      task_due: '📋',
      system: '🔔'
    };
    return icons[type] || '🔔';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'var(--text-muted)',
      normal: 'var(--text-primary)',
      high: 'var(--warning)',
      urgent: 'var(--error)'
    };
    return colors[priority] || 'var(--text-primary)';
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', maxHeight: '80vh' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            🔔 Notifications
            {unreadCount > 0 && (
              <span style={{ 
                marginLeft: '0.5rem', 
                background: 'var(--error)', 
                color: 'white', 
                borderRadius: '50%', 
                width: '24px', 
                height: '24px', 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '0.75rem' 
              }}>
                {unreadCount}
              </span>
            )}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          {/* Filter Tabs */}
          <div style={{ 
            display: 'flex', 
            borderBottom: '1px solid var(--border-color)',
            padding: '0 1rem'
          }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                color: filter === 'all' ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: filter === 'all' ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer'
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                color: filter === 'unread' ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: filter === 'unread' ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              Unread
              {unreadCount > 0 && (
                <span style={{
                  marginLeft: '0.25rem',
                  background: 'var(--error)',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem'
                }}>
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter('read')}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: 'transparent',
                color: filter === 'read' ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: filter === 'read' ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer'
              }}
            >
              Read
            </button>
          </div>

          {/* Notifications List */}
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No notifications
              </div>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  onClick={() => {
                    if (!notification.read) markAsRead(notification.id);
                    if (notification.action_url) {
                      // Navigate to client or handle action
                      window.location.hash = notification.action_url;
                    }
                  }}
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    background: notification.read ? 'transparent' : 'rgba(var(--primary-rgb), 0.05)',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = notification.read ? 'transparent' : 'rgba(var(--primary-rgb), 0.05)'}
                >
                  {!notification.read && (
                    <div style={{
                      position: 'absolute',
                      left: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '4px',
                      height: '60%',
                      background: 'var(--primary)',
                      borderRadius: '0 2px 2px 0'
                    }} />
                  )}
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <div style={{ fontSize: '1.5rem' }}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'start',
                        marginBottom: '0.25rem'
                      }}>
                        <h4 style={{ 
                          margin: 0, 
                          fontSize: '0.875rem', 
                          fontWeight: notification.read ? '400' : '600',
                          color: getPriorityColor(notification.priority)
                        }}>
                          {notification.title}
                        </h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '0.25rem',
                            fontSize: '0.875rem'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <p style={{ 
                        margin: 0, 
                        fontSize: '0.8125rem', 
                        color: 'var(--text-secondary)',
                        lineHeight: '1.4'
                      }}>
                        {notification.message}
                      </p>
                      <div style={{ 
                        marginTop: '0.5rem', 
                        fontSize: '0.75rem', 
                        color: 'var(--text-muted)' 
                      }}>
                        {new Date(notification.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="modal-footer">
          {unreadCount > 0 && (
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={markAllAsRead}
            >
              Mark All as Read
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPanel;

