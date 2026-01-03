import { getSupabaseClient } from './supabase';

// Service to automatically create notifications
export const notificationService = {
  // Check and create payment due notifications
  async checkPaymentDueNotifications(clients, defaultUserId) {
    const client = getSupabaseClient();
    if (!client) return;

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    if (!clients || !Array.isArray(clients)) return;

    for (const clientRecord of clients) {
      if (!clientRecord || !clientRecord.startDate || !clientRecord.paymentSchedule) continue;

      try {
        const startDate = new Date(clientRecord.startDate);
        if (isNaN(startDate.getTime())) continue; // Invalid date
        
        const monthsWithClient = clientRecord.monthsWithClient || 0;
        
        // Calculate next payment date (simplified for monthly)
        if (clientRecord.paymentSchedule === 'monthly') {
          const nextPaymentDate = new Date(startDate);
          nextPaymentDate.setMonth(nextPaymentDate.getMonth() + monthsWithClient + 1);
          
          const daysUntilDue = Math.ceil((nextPaymentDate - now) / (1000 * 60 * 60 * 24));
          
          // Create notification if payment is due in 3 days or less
          if (daysUntilDue <= 3) {
            const isOverdue = daysUntilDue < 0;
            const notificationType = isOverdue ? 'payment_overdue' : 'payment_due';
            const priority = isOverdue ? 'urgent' : 'high';
            
            // Get user ID from assignedTo (could be user ID or name)
            let targetUserId = defaultUserId;
            if (clientRecord.assignedTo) {
              // If assignedTo is a UUID, use it; otherwise try to find user by name
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (uuidRegex.test(clientRecord.assignedTo)) {
                targetUserId = clientRecord.assignedTo;
              } else {
                // Try to find user by name/email
                const { data: users } = await client
                  .from('users')
                  .select('id')
                  .or(`name.eq.${clientRecord.assignedTo},email.eq.${clientRecord.assignedTo}`)
                  .limit(1)
                  .maybeSingle()
                  .catch(() => ({ data: null }));
                
                if (users?.id) {
                  targetUserId = users.id;
                }
              }
            }
            
            if (targetUserId) {
              await this.createNotification({
                user_id: targetUserId,
                type: notificationType,
                title: `Payment ${isOverdue ? 'Overdue' : 'Due Soon'}: ${clientRecord.clientName || 'Unknown'}`,
                message: `Payment for ${clientRecord.clientName || 'Unknown'} is ${isOverdue ? Math.abs(daysUntilDue) + ' days overdue' : 'due in ' + daysUntilDue + ' days'}.`,
                related_client_id: clientRecord.id,
                related_entity_type: 'payment',
                priority,
                action_url: `#client-${clientRecord.id}`
              });
            }
          }
        }
      } catch (error) {
        console.error('Error processing payment notification for client:', clientRecord.id, error);
      }
    }
  },

  // Create notification for phase transitions
  async notifyPhaseTransition(clientId, fromPhase, toPhase, userId, clientName) {
    await this.createNotification({
      user_id: userId,
      type: 'phase_transition',
      title: `Phase Changed: ${toPhase}`,
      message: `${clientName} moved from ${fromPhase || 'unknown'} to ${toPhase}.`,
      related_client_id: clientId,
      related_entity_type: 'phase',
      priority: 'normal',
      action_url: `#client-${clientId}`
    });
  },

  // Create notification for testing phase completion
  async notifyTestingComplete(clientId, userId, clientName) {
    await this.createNotification({
      user_id: userId,
      type: 'testing_complete',
      title: `Testing Complete: ${clientName}`,
      message: `${clientName} has completed testing phase and is ready to move to running.`,
      related_client_id: clientId,
      related_entity_type: 'phase',
      priority: 'high',
      action_url: `#client-${clientId}`
    });
  },

  // Create notification for client milestones
  async notifyMilestone(clientId, userId, clientName, months) {
    await this.createNotification({
      user_id: userId,
      type: 'milestone',
      title: `🎯 ${months} Month Anniversary: ${clientName}`,
      message: `Congratulations! ${clientName} has been with us for ${months} months.`,
      related_client_id: clientId,
      related_entity_type: 'milestone',
      priority: 'normal',
      action_url: `#client-${clientId}`
    });
  },

  // Generic notification creator
  async createNotification(notificationData) {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
      // Check if notifications table exists (graceful degradation)
      const { data: existing } = await client
        .from('notifications')
        .select('id')
        .eq('user_id', notificationData.user_id)
        .eq('type', notificationData.type)
        .eq('related_client_id', notificationData.related_client_id)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .catch(() => ({ data: null })); // If table doesn't exist, continue

      // Only create if no recent unread notification exists
      if (existing?.data) {
        const existingDate = new Date(existing.data.created_at);
        const hoursSince = (new Date() - existingDate) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          return false; // Don't create duplicate within 24 hours
        }
      }

      const { error } = await client
        .from('notifications')
        .insert(notificationData);

      if (error) {
        // If table doesn't exist, just log and continue
        if (error.code === '42P01') {
          console.warn('Notifications table not found. Run database migration.');
          return false;
        }
        throw error;
      }
      return true;
    } catch (error) {
      // Gracefully handle errors (table might not exist yet)
      if (error.code !== '42P01') {
        console.error('Error creating notification:', error);
      }
      return false;
    }
  }
};

