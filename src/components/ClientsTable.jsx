import React, { useMemo, useState, useEffect } from 'react';
import { getPackageInfo, formatPrice } from '../utils/clients';

const ClientsTable = ({ clients, filters, onViewClient, onEditClient, onMoveClient }) => {
  // Response deadline from settings (default 24 hours)
  const [responseDeadlineHours, setResponseDeadlineHours] = useState(24);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('warning_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.response_deadline_hours) {
          setResponseDeadlineHours(settings.response_deadline_hours);
        }
      }
    } catch (e) {
      console.log('Could not load warning settings:', e);
    }
  }, []);

  // Calculate deadline countdown for a client
  const getDeadlineInfo = (client) => {
    const lastActivityDate = client.lastActivity ? new Date(client.lastActivity) :
      client.created_at ? new Date(client.created_at) : null;

    if (!lastActivityDate) {
      return { text: '—', color: 'var(--text-muted)', priority: 0 };
    }

    const now = new Date();
    const deadlineMs = responseDeadlineHours * 60 * 60 * 1000;
    const deadline = new Date(lastActivityDate.getTime() + deadlineMs);
    const timeLeftMs = deadline - now;

    // Already overdue
    if (timeLeftMs <= 0) {
      const overdueHours = Math.abs(timeLeftMs / (1000 * 60 * 60));
      if (overdueHours > 24) {
        return {
          text: `${Math.floor(overdueHours / 24)}d overdue`,
          color: 'var(--error)',
          priority: 3
        };
      }
      return {
        text: `${Math.floor(overdueHours)}h overdue`,
        color: 'var(--error)',
        priority: 3
      };
    }

    const hoursLeft = timeLeftMs / (1000 * 60 * 60);
    const percentLeft = hoursLeft / responseDeadlineHours;

    // Less than 10% time left - red
    if (percentLeft < 0.1) {
      const minsLeft = Math.floor(timeLeftMs / (1000 * 60));
      return {
        text: minsLeft < 60 ? `${minsLeft}m left` : `${Math.floor(hoursLeft)}h left`,
        color: 'var(--error)',
        priority: 2
      };
    }

    // Less than 50% time left - yellow
    if (percentLeft < 0.5) {
      return {
        text: `${Math.floor(hoursLeft)}h left`,
        color: 'var(--warning)',
        priority: 1
      };
    }

    // Plenty of time - green
    if (hoursLeft > 24) {
      return {
        text: `${Math.floor(hoursLeft / 24)}d ${Math.floor(hoursLeft % 24)}h`,
        color: 'var(--success)',
        priority: 0
      };
    }

    return {
      text: `${Math.floor(hoursLeft)}h left`,
      color: 'var(--success)',
      priority: 0
    };
  };

  // Apply filters
  const filteredClients = useMemo(() => {
    let filtered = [...clients];

    // Search filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(client => {
        const searchable = [
          client.clientName,
          client.businessName,
          client.contactDetails,
          ...(client.tags || [])
        ].join(' ').toLowerCase();
        return searchable.includes(term);
      });
    }

    // Phase filter
    if (filters.filterPhase) {
      filtered = filtered.filter(c => c.phase === filters.filterPhase);
    }

    // Package filter
    if (filters.filterPackage) {
      filtered = filtered.filter(c => c.package === filters.filterPackage);
    }

    // Payment filter
    if (filters.filterPayment) {
      filtered = filtered.filter(c => c.paymentStatus === filters.filterPayment);
    }

    // Assigned To filter
    if (filters.filterAssignedTo) {
      if (filters.filterAssignedTo === 'unassigned') {
        filtered = filtered.filter(c => !c.assignedTo);
      } else {
        filtered = filtered.filter(c => c.assignedTo === filters.filterAssignedTo);
      }
    }

    // Sort by deadline urgency first, then priority, then name
    filtered.sort((a, b) => {
      const aDeadline = getDeadlineInfo(a);
      const bDeadline = getDeadlineInfo(b);
      if (aDeadline.priority !== bDeadline.priority) {
        return bDeadline.priority - aDeadline.priority;
      }
      const priorityDiff = (a.priority || 999) - (b.priority || 999);
      if (priorityDiff !== 0) return priorityDiff;
      return (a.clientName || '').localeCompare(b.clientName || '');
    });

    return filtered;
  }, [clients, filters, responseDeadlineHours]);

  const getPhaseConfig = (phase) => {
    const configs = {
      'booked': { emoji: '📅', title: 'Booked', color: 'var(--phase-booked)' },
      'follow-up': { emoji: '📞', title: 'Follow Up', color: 'var(--text-muted)' },
      'preparing': { emoji: '⏳', title: 'Preparing', color: 'var(--phase-preparing)' },
      'testing': { emoji: '🧪', title: 'Testing', color: 'var(--phase-testing)' },
      'running': { emoji: '🚀', title: 'Running', color: 'var(--phase-running)' }
    };
    return configs[phase] || { emoji: '❓', title: phase, color: 'var(--text-muted)' };
  };

  const getPaymentIcon = (status) => {
    const icons = {
      'paid': '✅',
      'partial': '⚠️',
      'unpaid': '❌'
    };
    return icons[status] || '❓';
  };

  const handlePhaseChange = (clientId, newPhase) => {
    if (onMoveClient) {
      onMoveClient(clientId, newPhase);
    }
  };

  return (
    <div className="clients-table-container">
      <div className="table-responsive">
        <table className="data-table clients-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>Priority</th>
              <th>Client Name</th>
              <th>Business</th>
              <th>Package</th>
              <th>Phase</th>
              <th style={{ width: '100px' }}>⏰ Deadline</th>
              <th>Payment Status</th>
              <th>Assigned To</th>
              <th style={{ width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No clients found matching your filters
                </td>
              </tr>
            ) : (
              filteredClients.map(client => {
                const pkg = getPackageInfo(client);
                const phaseConfig = getPhaseConfig(client.phase);
                const paymentIcon = getPaymentIcon(client.paymentStatus);
                const deadlineInfo = getDeadlineInfo(client);

                return (
                  <tr key={client.id} className="client-table-row">
                    <td>
                      <span className="priority-badge" style={{
                        background: client.priority === 1 ? 'var(--danger)' :
                          client.priority === 2 ? 'var(--warning)' :
                            'var(--text-muted)',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        {client.priority || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '500' }}>{client.clientName || '—'}</div>
                    </td>
                    <td>{client.businessName || '—'}</td>
                    <td>
                      <span className={`package-badge package-${client.package}`} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}>
                        {pkg.emoji} {formatPrice(pkg.price)}
                      </span>
                    </td>
                    <td>
                      <select
                        className="form-select"
                        value={client.phase || 'booked'}
                        onChange={(e) => {
                          e.stopPropagation();
                          handlePhaseChange(client.id, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          minWidth: '140px',
                          fontSize: '0.875rem',
                          padding: '0.375rem 0.5rem',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--text-primary)',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="booked">📅 Booked</option>
                        <option value="follow-up">📞 Follow Up</option>
                        <option value="preparing">⏳ Preparing</option>
                        <option value="testing">🧪 Testing</option>
                        <option value="running">🚀 Running</option>
                      </select>
                    </td>
                    <td>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: deadlineInfo.color,
                        background: `${deadlineInfo.color}20`
                      }}>
                        {deadlineInfo.text}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        {paymentIcon} {client.paymentStatus || 'unpaid'}
                      </span>
                    </td>
                    <td>{client.assignedUser?.name || client.assignedUser?.email || client.assignedTo || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => onViewClient(client.id)}
                          title="View Client"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          👁️
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => onEditClient(client.id)}
                          title="Edit Client"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          ✏️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClientsTable;

