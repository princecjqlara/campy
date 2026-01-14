import React, { useState, useEffect } from 'react';
import { GOAL_TYPES, setConversationGoal, getGoalTemplates } from '../services/goalController';

/**
 * Goal Selector Component
 * Allows users to select and configure conversation goals
 */
export default function GoalSelector({ conversationId, onGoalSet, onClose }) {
    const [selectedType, setSelectedType] = useState(null);
    const [customPrompt, setCustomPrompt] = useState('');
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        const data = await getGoalTemplates();
        setTemplates(data);
    };

    const handleSelectGoal = async () => {
        if (!selectedType) return;

        setLoading(true);
        const result = await setConversationGoal(conversationId, selectedType, {
            customPrompt: selectedType === 'custom' ? customPrompt : undefined
        });
        setLoading(false);

        if (result.success) {
            onGoalSet?.(result.goal);
            onClose?.();
        }
    };

    const styles = {
        container: {
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            maxWidth: '400px',
            width: '100%'
        },
        title: {
            fontSize: '16px',
            fontWeight: 600,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        },
        goalOption: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            borderRadius: '8px',
            border: '2px solid #e5e7eb',
            marginBottom: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s'
        },
        goalOptionSelected: {
            borderColor: '#7c3aed',
            background: '#f5f3ff'
        },
        icon: {
            fontSize: '24px'
        },
        goalInfo: {
            flex: 1
        },
        goalName: {
            fontWeight: 500,
            marginBottom: '2px'
        },
        goalDesc: {
            fontSize: '12px',
            color: '#6b7280'
        },
        textArea: {
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            marginTop: '12px',
            fontSize: '14px',
            resize: 'vertical',
            minHeight: '80px'
        },
        actions: {
            display: 'flex',
            gap: '8px',
            marginTop: '16px'
        },
        button: {
            flex: 1,
            padding: '10px 16px',
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
        }
    };

    return (
        <div style={styles.container}>
            <h3 style={styles.title}>
                🎯 Set Conversation Goal
            </h3>

            {Object.entries(GOAL_TYPES).map(([type, info]) => (
                <div
                    key={type}
                    style={{
                        ...styles.goalOption,
                        ...(selectedType === type ? styles.goalOptionSelected : {})
                    }}
                    onClick={() => setSelectedType(type)}
                >
                    <span style={styles.icon}>{info.icon}</span>
                    <div style={styles.goalInfo}>
                        <div style={styles.goalName}>{info.name}</div>
                        <div style={styles.goalDesc}>{info.description}</div>
                    </div>
                    {selectedType === type && (
                        <span style={{ color: '#7c3aed' }}>✓</span>
                    )}
                </div>
            ))}

            {selectedType === 'custom' && (
                <textarea
                    style={styles.textArea}
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                    placeholder="Describe your custom goal and how the AI should approach it..."
                />
            )}

            <div style={styles.actions}>
                <button
                    style={{ ...styles.button, ...styles.buttonSecondary }}
                    onClick={onClose}
                >
                    Cancel
                </button>
                <button
                    style={{
                        ...styles.button,
                        ...styles.buttonPrimary,
                        opacity: !selectedType || loading ? 0.5 : 1,
                        cursor: !selectedType || loading ? 'not-allowed' : 'pointer'
                    }}
                    onClick={handleSelectGoal}
                    disabled={!selectedType || loading}
                >
                    {loading ? 'Setting...' : 'Set Goal'}
                </button>
            </div>
        </div>
    );
}
