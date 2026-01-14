import React, { useMemo, useState, useEffect } from 'react';

/**
 * DeadlineAlerts - Shows clients who have exceeded their stage deadline
 * Uses stage_warning_days from settings to determine if client needs attention
 */
const DeadlineAlerts = ({ clients, onViewClient, onEditClient }) => {
    const [warningSettings, setWarningSettings] = useState({
        stage_warning_days: {
            'booked': 3,
            'follow-up': 2,
            'preparing': 7,
            'testing': 30, // 30 days for testing stage
            'running': 0
        },
        warning_color: '#f59e0b',
        danger_color: '#ef4444'
    });
    const [isExpanded, setIsExpanded] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    useEffect(() => {
        try {
            const saved = localStorage.getItem('warning_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                setWarningSettings(prev => ({
                    ...prev,
                    ...settings,
                    stage_warning_days: {
                        ...prev.stage_warning_days,
                        ...(settings.stage_warning_days || {})
                    }
                }));
            }
        } catch (e) {
            console.log('Could not load warning settings:', e);
        }
    }, []);

    // Calculate if client has exceeded stage deadline
    const getStageDeadlineInfo = (client) => {
        if (!client.phase) return null;

        const thresholdDays = warningSettings.stage_warning_days[client.phase];
        if (!thresholdDays || thresholdDays <= 0) return null;

        // Use stageEnteredAt, phaseChangedAt, createdAt, or created_at
        const stageDate = client.stageEnteredAt || client.phaseChangedAt || client.createdAt || client.created_at;
        if (!stageDate) return null;

        const enteredAt = new Date(stageDate);
        const now = new Date();
        const daysInStage = Math.floor((now - enteredAt) / (1000 * 60 * 60 * 24));
        const daysRemaining = thresholdDays - daysInStage;

        // Calculate percentage for color coding
        const percentUsed = daysInStage / thresholdDays;

        // Already overdue
        if (daysRemaining <= 0) {
            return {
                text: `${Math.abs(daysRemaining)}d overdue`,
                daysInStage,
                thresholdDays,
                color: warningSettings.danger_color,
                priority: 3,
                isUrgent: true
            };
        }

        // Less than 20% time remaining - critical
        if (percentUsed >= 0.8) {
            return {
                text: `${daysRemaining}d left`,
                daysInStage,
                thresholdDays,
                color: warningSettings.danger_color,
                priority: 2,
                isUrgent: true
            };
        }

        // 50-80% time used - warning
        if (percentUsed >= 0.5) {
            return {
                text: `${daysRemaining}d left`,
                daysInStage,
                thresholdDays,
                color: warningSettings.warning_color,
                priority: 1,
                isUrgent: true
            };
        }

        // Still have time - not urgent, don't show
        return null;
    };

    // Filter and sort clients with urgent deadlines
    const urgentClients = useMemo(() => {
        return clients
            .map(client => ({
                ...client,
                deadlineInfo: getStageDeadlineInfo(client)
            }))
            .filter(client => client.deadlineInfo?.isUrgent)
            .sort((a, b) => b.deadlineInfo.priority - a.deadlineInfo.priority);
    }, [clients, warningSettings]);

    // Always show component with message if no urgent clients
    return (
        <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: urgentClients.length > 0 ? '1px solid var(--error)' : '1px solid var(--border-color)',
            overflow: 'hidden',
            flex: 1
        }}>
            {/* Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '0.75rem 1rem',
                    background: urgentClients.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    borderBottom: isExpanded && urgentClients.length > 0 ? '1px solid var(--border-color)' : 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>⏰</span>
                    <h4 style={{ margin: 0, color: urgentClients.length > 0 ? 'var(--error)' : 'var(--text-primary)' }}>
                        Pipeline Deadline Alerts
                    </h4>
                    <span style={{
                        background: urgentClients.length > 0 ? 'var(--error)' : 'var(--success)',
                        color: 'white',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                    }}>
                        {urgentClients.length > 0 ? urgentClients.length : '✓'}
                    </span>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>
                    {isExpanded ? '▲' : '▼'}
                </span>
            </div>

            {/* Content */}
            {isExpanded && (
                urgentClients.length === 0 ? (
                    <div style={{
                        padding: '1rem',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '0.875rem'
                    }}>
                        ✅ All clients are within their stage deadlines
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-tertiary)' }}>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Client</th>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Business</th>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phase</th>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Time in Stage</th>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Deadline</th>
                                    <th style={{ padding: '0.5rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {urgentClients
                                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                                    .map(client => (
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
                                                <span style={{ fontSize: '0.875rem' }}>
                                                    {client.deadlineInfo.daysInStage}d / {client.deadlineInfo.thresholdDays}d
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

                        {/* Pagination Controls */}
                        {urgentClients.length > itemsPerPage && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.75rem 1rem',
                                borderTop: '1px solid var(--border-color)',
                                background: 'var(--bg-tertiary)'
                            }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, urgentClients.length)} of {urgentClients.length}
                                </span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                    >
                                        ← Prev
                                    </button>
                                    <span style={{
                                        padding: '0.25rem 0.5rem',
                                        fontSize: '0.75rem',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}>
                                        {currentPage} / {Math.ceil(urgentClients.length / itemsPerPage)}
                                    </span>
                                    <button
                                        className="btn btn-sm btn-secondary"
                                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(urgentClients.length / itemsPerPage), p + 1))}
                                        disabled={currentPage >= Math.ceil(urgentClients.length / itemsPerPage)}
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                    >
                                        Next →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            )}
        </div>
    );
};

export default DeadlineAlerts;
