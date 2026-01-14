import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { checkSafetyStatus, toggleAI, activateHumanTakeover, deactivateTakeover } from '../services/safetyLayer';
import { getActiveGoal, setConversationGoal, abandonGoal, GOAL_TYPES, getGoalTemplates } from '../services/goalController';
import { getScheduledFollowUps, cancelFollowUp, scheduleFollowUp, calculateBestTimeToContact } from '../services/followUpScheduler';

/**
 * AI Control Panel Component
 * Module 8: User Controls & Transparency
 * Shows AI status, scheduled follow-ups, goals, and action history
 */
export default function AIControlPanel({ conversationId, participantName, onClose }) {
    const [loading, setLoading] = useState(true);
    const [safetyStatus, setSafetyStatus] = useState(null);
    const [activeGoal, setActiveGoal] = useState(null);
    const [scheduledFollowUps, setScheduledFollowUps] = useState([]);
    const [actionLog, setActionLog] = useState([]);
    const [goalTemplates, setGoalTemplates] = useState([]);
    const [bestTime, setBestTime] = useState(null);
    const [activeTab, setActiveTab] = useState('status');
    const [showGoalSelector, setShowGoalSelector] = useState(false);

    const supabase = getSupabaseClient();

    // Load all data
    useEffect(() => {
        if (conversationId) {
            loadAllData();
        }
    }, [conversationId]);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const [safety, goal, followUps, logs, templates, time] = await Promise.all([
                checkSafetyStatus(conversationId),
                getActiveGoal(conversationId),
                getScheduledFollowUps(conversationId, { includeAll: true }),
                loadActionLog(),
                getGoalTemplates(),
                calculateBestTimeToContact(conversationId)
            ]);

            setSafetyStatus(safety);
            setActiveGoal(goal);
            setScheduledFollowUps(followUps);
            setActionLog(logs);
            setGoalTemplates(templates);
            setBestTime(time);
        } catch (error) {
            console.error('Error loading AI panel data:', error);
        }
        setLoading(false);
    };

    const loadActionLog = async () => {
        const { data } = await supabase
            .from('ai_action_log')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(20);
        return data || [];
    };

    // Handlers
    const handleToggleAI = async () => {
        const newEnabled = !safetyStatus?.canAIRespond && !safetyStatus?.humanTakeover;

        if (safetyStatus?.humanTakeover) {
            await deactivateTakeover(conversationId);
        } else if (newEnabled) {
            await toggleAI(conversationId, true);
        } else {
            await activateHumanTakeover(conversationId, 'admin_override', {
                triggeredBy: 'admin',
                durationHours: 24
            });
        }

        await loadAllData();
    };

    const handleSetGoal = async (goalType) => {
        await setConversationGoal(conversationId, goalType);
        setShowGoalSelector(false);
        await loadAllData();
    };

    const handleAbandonGoal = async () => {
        if (activeGoal) {
            await abandonGoal(activeGoal.id, 'User abandoned');
            await loadAllData();
        }
    };

    const handleCancelFollowUp = async (followUpId) => {
        await cancelFollowUp(followUpId, 'User cancelled');
        await loadAllData();
    };

    const handleScheduleFollowUp = async () => {
        await scheduleFollowUp(conversationId, {
            type: 'manual',
            useBestTime: true,
            reason: 'Manual follow-up scheduled'
        });
        await loadAllData();
    };

    // Styles
    const styles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        },
        panel: {
            background: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        },
        header: {
            padding: '20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        title: {
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: '#111827'
        },
        closeBtn: {
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#6b7280'
        },
        tabs: {
            display: 'flex',
            borderBottom: '1px solid #e5e7eb'
        },
        tab: {
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#6b7280',
            borderBottom: '2px solid transparent'
        },
        activeTab: {
            color: '#7c3aed',
            borderBottomColor: '#7c3aed'
        },
        content: {
            padding: '20px',
            overflowY: 'auto',
            flex: 1
        },
        section: {
            marginBottom: '24px'
        },
        sectionTitle: {
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
            marginBottom: '12px'
        },
        statusCard: {
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '12px'
        },
        statusRow: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
        },
        badge: {
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 500
        },
        badgeGreen: {
            background: '#d1fae5',
            color: '#065f46'
        },
        badgeRed: {
            background: '#fee2e2',
            color: '#991b1b'
        },
        badgeYellow: {
            background: '#fef3c7',
            color: '#92400e'
        },
        badgePurple: {
            background: '#ede9fe',
            color: '#5b21b6'
        },
        button: {
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500
        },
        buttonPrimary: {
            background: '#7c3aed',
            color: 'white'
        },
        buttonSecondary: {
            background: '#f3f4f6',
            color: '#374151'
        },
        buttonDanger: {
            background: '#fee2e2',
            color: '#991b1b'
        },
        goalCard: {
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            borderRadius: '8px',
            padding: '16px',
            color: 'white',
            marginBottom: '12px'
        },
        followUpItem: {
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        logItem: {
            padding: '12px 0',
            borderBottom: '1px solid #f3f4f6',
            fontSize: '13px'
        },
        goalOption: {
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '8px',
            cursor: 'pointer',
            border: '2px solid transparent',
            transition: 'all 0.2s'
        }
    };

    if (loading) {
        return (
            <div style={styles.overlay}>
                <div style={{ ...styles.panel, padding: '40px', textAlign: 'center' }}>
                    Loading AI Controls...
                </div>
            </div>
        );
    }

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.panel} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <div>
                        <h2 style={styles.title}>🤖 AI Controls</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                            {participantName || 'Contact'}
                        </p>
                    </div>
                    <button style={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                {/* Tabs */}
                <div style={styles.tabs}>
                    {['status', 'goals', 'followups', 'history'].map(tab => (
                        <button
                            key={tab}
                            style={{
                                ...styles.tab,
                                ...(activeTab === tab ? styles.activeTab : {})
                            }}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab === 'status' && '📊 Status'}
                            {tab === 'goals' && '🎯 Goals'}
                            {tab === 'followups' && '📅 Follow-ups'}
                            {tab === 'history' && '📜 History'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={styles.content}>
                    {/* Status Tab */}
                    {activeTab === 'status' && (
                        <>
                            <div style={styles.section}>
                                <h3 style={styles.sectionTitle}>AI Status</h3>
                                <div style={styles.statusCard}>
                                    <div style={styles.statusRow}>
                                        <span>AI Messaging</span>
                                        <span style={{
                                            ...styles.badge,
                                            ...(safetyStatus?.canAIRespond ? styles.badgeGreen : styles.badgeRed)
                                        }}>
                                            {safetyStatus?.canAIRespond ? 'Active' : 'Paused'}
                                        </span>
                                    </div>

                                    {safetyStatus?.blockReason && (
                                        <div style={styles.statusRow}>
                                            <span>Reason</span>
                                            <span style={{ ...styles.badge, ...styles.badgeYellow }}>
                                                {safetyStatus.blockReason.replace('_', ' ')}
                                            </span>
                                        </div>
                                    )}

                                    <div style={styles.statusRow}>
                                        <span>Confidence</span>
                                        <span style={{
                                            ...styles.badge,
                                            ...(safetyStatus?.confidence >= 0.7 ? styles.badgeGreen :
                                                safetyStatus?.confidence >= 0.4 ? styles.badgeYellow : styles.badgeRed)
                                        }}>
                                            {((safetyStatus?.confidence || 0) * 100).toFixed(0)}%
                                        </span>
                                    </div>

                                    {safetyStatus?.optedOut && (
                                        <div style={{
                                            marginTop: '12px',
                                            padding: '8px 12px',
                                            background: '#fee2e2',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            color: '#991b1b'
                                        }}>
                                            ⚠️ Contact has opted out of AI messaging
                                        </div>
                                    )}
                                </div>

                                <button
                                    style={{
                                        ...styles.button,
                                        ...(safetyStatus?.canAIRespond ? styles.buttonDanger : styles.buttonPrimary),
                                        width: '100%'
                                    }}
                                    onClick={handleToggleAI}
                                    disabled={safetyStatus?.optedOut}
                                >
                                    {safetyStatus?.canAIRespond ? '⏸️ Pause AI' : '▶️ Resume AI'}
                                </button>
                            </div>

                            {bestTime && (
                                <div style={styles.section}>
                                    <h3 style={styles.sectionTitle}>Best Time to Contact</h3>
                                    <div style={styles.statusCard}>
                                        <div style={styles.statusRow}>
                                            <span>Optimal Time</span>
                                            <span style={{ fontWeight: 500 }}>
                                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][bestTime.dayOfWeek]} at {bestTime.hourOfDay}:00
                                            </span>
                                        </div>
                                        <div style={styles.statusRow}>
                                            <span>Next Occurrence</span>
                                            <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                                {new Date(bestTime.nextBestTime).toLocaleString()}
                                            </span>
                                        </div>
                                        <div style={styles.statusRow}>
                                            <span>Confidence</span>
                                            <span style={{ ...styles.badge, ...styles.badgePurple }}>
                                                {(bestTime.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Goals Tab */}
                    {activeTab === 'goals' && (
                        <>
                            {activeGoal ? (
                                <div style={styles.section}>
                                    <h3 style={styles.sectionTitle}>Active Goal</h3>
                                    <div style={styles.goalCard}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '24px' }}>
                                                {GOAL_TYPES[activeGoal.goal_type]?.icon || '🎯'}
                                            </span>
                                            <span style={{ fontSize: '16px', fontWeight: 600 }}>
                                                {GOAL_TYPES[activeGoal.goal_type]?.name || activeGoal.goal_type}
                                            </span>
                                        </div>
                                        <div style={{
                                            background: 'rgba(255,255,255,0.2)',
                                            borderRadius: '4px',
                                            height: '8px',
                                            marginBottom: '8px'
                                        }}>
                                            <div style={{
                                                background: 'white',
                                                borderRadius: '4px',
                                                height: '100%',
                                                width: `${activeGoal.progress_score || 0}%`
                                            }} />
                                        </div>
                                        <div style={{ fontSize: '12px', opacity: 0.9 }}>
                                            Progress: {activeGoal.progress_score || 0}%
                                        </div>
                                    </div>
                                    <button
                                        style={{ ...styles.button, ...styles.buttonDanger }}
                                        onClick={handleAbandonGoal}
                                    >
                                        Abandon Goal
                                    </button>
                                </div>
                            ) : (
                                <div style={styles.section}>
                                    <h3 style={styles.sectionTitle}>Set a Goal</h3>
                                    {Object.entries(GOAL_TYPES).map(([type, info]) => (
                                        <div
                                            key={type}
                                            style={styles.goalOption}
                                            onClick={() => handleSetGoal(type)}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.borderColor = '#7c3aed';
                                                e.currentTarget.style.background = '#f5f3ff';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.borderColor = 'transparent';
                                                e.currentTarget.style.background = '#f9fafb';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ fontSize: '24px' }}>{info.icon}</span>
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{info.name}</div>
                                                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                        {info.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Follow-ups Tab */}
                    {activeTab === 'followups' && (
                        <>
                            <div style={styles.section}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Scheduled Follow-ups</h3>
                                    <button
                                        style={{ ...styles.button, ...styles.buttonPrimary }}
                                        onClick={handleScheduleFollowUp}
                                    >
                                        + Schedule
                                    </button>
                                </div>

                                {scheduledFollowUps.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                                        No scheduled follow-ups
                                    </div>
                                ) : (
                                    scheduledFollowUps.map(fu => (
                                        <div key={fu.id} style={styles.followUpItem}>
                                            <div>
                                                <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                                                    {fu.follow_up_type.replace('_', ' ')}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                    {new Date(fu.scheduled_at).toLocaleString()}
                                                </div>
                                                {fu.reason && (
                                                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                                                        {fu.reason}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{
                                                    ...styles.badge,
                                                    ...(fu.status === 'pending' ? styles.badgeYellow :
                                                        fu.status === 'sent' ? styles.badgeGreen : styles.badgeRed)
                                                }}>
                                                    {fu.status}
                                                </span>
                                                {fu.status === 'pending' && (
                                                    <button
                                                        style={{ ...styles.button, ...styles.buttonSecondary, padding: '4px 8px' }}
                                                        onClick={() => handleCancelFollowUp(fu.id)}
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}

                    {/* History Tab */}
                    {activeTab === 'history' && (
                        <div style={styles.section}>
                            <h3 style={styles.sectionTitle}>AI Action Log</h3>
                            {actionLog.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                                    No actions recorded yet
                                </div>
                            ) : (
                                actionLog.map(log => (
                                    <div key={log.id} style={styles.logItem}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{
                                                fontWeight: 500,
                                                color: log.action_type.includes('sent') ? '#059669' :
                                                    log.action_type.includes('takeover') ? '#dc2626' : '#374151'
                                            }}>
                                                {log.action_type.replace(/_/g, ' ')}
                                            </span>
                                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </span>
                                        </div>
                                        {log.explanation && (
                                            <div style={{ color: '#6b7280', fontSize: '12px' }}>
                                                {log.explanation}
                                            </div>
                                        )}
                                        {log.confidence_score && (
                                            <div style={{ marginTop: '4px' }}>
                                                <span style={{ ...styles.badge, ...styles.badgePurple }}>
                                                    {(log.confidence_score * 100).toFixed(0)}% confidence
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
