import React, { useMemo, useState, useEffect } from 'react';

/**
 * DeadlineAlerts - Shows clients with approaching or overdue deadlines
 * Displays as a collapsible table at the top of the Clients tab
 */
const DeadlineAlerts = ({ clients, onViewClient, onEditClient }) => {
    // Response deadline from settings (default 24 hours)
    const [responseDeadlineHours, setResponseDeadlineHours] = useState(24);
    const [isExpanded, setIsExpanded] = useState(true);

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

    // Calculate deadline info for a client
    const getDeadlineInfo = (client) => {
        const lastActivityDate = client.lastActivity ? new Date(client.lastActivity) :
            client.created_at ? new Date(client.created_at) : null;

        if (!lastActivityDate) {
            return null;
        }

        const now = new Date();
        const deadlineMs = responseDeadlineHours * 60 * 60 * 1000;
        const deadline = new Date(lastActivityDate.getTime() + deadlineMs);
        const timeLeftMs = deadline - now;
        const hoursLeft = timeLeftMs / (1000 * 60 * 60);
        const percentLeft = hoursLeft / responseDeadlineHours;

        // Already overdue
        if (timeLeftMs <= 0) {
            const overdueHours = Math.abs(timeLeftMs / (1000 * 60 * 60));
            return {
                text: overdueHours > 24 ? `${Math.floor(overdueHours / 24)}d overdue` : `${Math.floor(overdueHours)}h overdue`,
                color: 'var(--error)',
                priority: 3,
                isUrgent: true
            };
        }

        // Less than 50% time left = urgent
        if (percentLeft < 0.5) {
            const text = hoursLeft < 1
                ? `${Math.floor(timeLeftMs / (1000 * 60))}m left`
                : `${Math.floor(hoursLeft)}h left`;

            return {
                text,
                color: percentLeft < 0.1 ? 'var(--error)' : 'var(--warning)',
                priority: percentLeft < 0.1 ? 2 : 1,
                isUrgent: true
            };
        }

        // Not urgent
        return {
            text: `${Math.floor(hoursLeft)}h left`,
            color: 'var(--success)',
            priority: 0,
            isUrgent: false
        };
    };

    // Filter and sort clients with urgent deadlines
    const urgentClients = useMemo(() => {
        return clients
            .map(client => ({
                ...client,
                deadlineInfo: getDeadlineInfo(client)
            }))
            .filter(client => client.deadlineInfo?.isUrgent)
            .sort((a, b) => b.deadlineInfo.priority - a.deadlineInfo.priority);
    }, [clients, responseDeadlineHours]);

    // Don't render if no urgent deadlines
    if (urgentClients.length === 0) {
        return null;
    }

    return (
        <div style={{
            margin: '0 1.5rem 1rem',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--error)',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>⏰</span>
                    <h4 style={{ margin: 0, color: 'var(--error)' }}>
                        Deadline Alerts
                    </h4>
                    <span style={{
                        background: 'var(--error)',
                        color: 'white',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                    }}>
                        {urgentClients.length}
                    </span>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>
                    {isExpanded ? '▲' : '▼'}
                </span>
            </div>

            {/* Table */}
            {isExpanded && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)' }}>
                                <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Client</th>
                                <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Business</th>
                                <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phase</th>
                                <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Deadline</th>
                                <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {urgentClients.map(client => (
                                <tr
                                    key={client.id}
                                    style={{
                                        borderBottom: '1px solid var(--border-color)',
                                        background: client.deadlineInfo.priority >= 2 ? 'rgba(239, 68, 68, 0.05)' : 'transparent'
                                    }}
                                >
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <span style={{ fontWeight: '500' }}>{client.clientName || '—'}</span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                                        {client.businessName || '—'}
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            background: 'var(--bg-tertiary)'
                                        }}>
                                            {client.phase === 'booked' && '📅 Booked'}
                                            {client.phase === 'follow-up' && '📞 Follow Up'}
                                            {client.phase === 'preparing' && '⏳ Preparing'}
                                            {client.phase === 'testing' && '🧪 Testing'}
                                            {client.phase === 'running' && '🚀 Running'}
                                            {!['booked', 'follow-up', 'preparing', 'testing', 'running'].includes(client.phase) && (client.phase || '—')}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <span style={{
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '4px',
                                            fontSize: '0.875rem',
                                            fontWeight: '600',
                                            color: client.deadlineInfo.color,
                                            background: `${client.deadlineInfo.color}20`
                                        }}>
                                            {client.deadlineInfo.text}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.75rem 1rem' }}>
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
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default DeadlineAlerts;
