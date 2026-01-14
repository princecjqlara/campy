import React, { useState, useEffect } from 'react';
import { getPackageInfo, formatPrice } from '../utils/clients';

// Helper to get payment date indicator
const getPaymentDateIndicator = (client) => {
  if (!client.nextPaymentDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const paymentDate = new Date(client.nextPaymentDate);
  paymentDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((paymentDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: 'PAST DUE', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
  } else if (diffDays === 0) {
    return { text: 'DUE TODAY', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
  } else if (diffDays <= 3) {
    return { text: `DUE IN ${diffDays}d`, color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
  }
  return null;
};

// Check if client is new (added within 3 days)
const isNewClient = (client) => {
  if (!client.createdAt) return false;
  const createdDate = new Date(client.createdAt);
  const now = new Date();
  const diffDays = (now - createdDate) / (1000 * 60 * 60 * 24);
  return diffDays <= 3;
};

// Check if client has been in current stage too long
const getStageWarning = (client, warningSettings) => {
  if (!client.phase) return null;

  // Use stageEnteredAt if available, otherwise fall back to createdAt or updated_at
  const stageDate = client.stageEnteredAt || client.phaseChangedAt || client.createdAt || client.created_at;
  if (!stageDate) return null;

  const stageWarningDays = warningSettings?.stage_warning_days || {};
  const thresholdDays = stageWarningDays[client.phase];

  if (!thresholdDays || thresholdDays <= 0) return null;

  const enteredAt = new Date(stageDate);
  const now = new Date();
  const daysInStage = Math.floor((now - enteredAt) / (1000 * 60 * 60 * 24));

  if (daysInStage >= thresholdDays) {
    const overdueDays = daysInStage - thresholdDays;
    return {
      daysInStage,
      thresholdDays,
      overdueDays,
      color: warningSettings?.warning_color || '#f59e0b',
      dangerColor: warningSettings?.danger_color || '#ef4444',
      isDanger: overdueDays > thresholdDays // Double the threshold = danger
    };
  }

  return null;
};

const ClientCard = ({ client, onView, onEdit }) => {
  const [warningSettings, setWarningSettings] = useState({
    stage_warning_days: {
      'booked': 3,
      'follow-up': 2,
      'preparing': 7,
      'testing': 30,
      'running': 0
    },
    warning_color: '#f59e0b',
    danger_color: '#ef4444'
  });

  // Load warning settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('warning_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        setWarningSettings(prev => ({
          ...prev,
          ...parsed,
          stage_warning_days: {
            ...prev.stage_warning_days,
            ...(parsed.stage_warning_days || {})
          }
        }));
      }
    } catch (e) {
      console.log('Could not load warning settings');
    }
  }, []);

  const pkg = getPackageInfo(client);
  const priority = client.priority || 1;
  const paymentIndicator = getPaymentDateIndicator(client);
  const isNew = isNewClient(client);
  const stageWarning = getStageWarning(client, warningSettings);

  const paymentClass = client.paymentStatus === 'paid' ? 'payment-paid' :
    client.paymentStatus === 'partial' ? 'payment-partial' : 'payment-unpaid';
  const paymentIcon = client.paymentStatus === 'paid' ? '✅' :
    client.paymentStatus === 'partial' ? '⚠️' : '❌';

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', client.id);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
    e.currentTarget.style.cursor = 'grabbing';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    e.currentTarget.style.cursor = 'grab';
  };

  return (
    <div
      className="client-card"
      data-id={client.id}
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        cursor: 'grab',
        borderLeft: stageWarning ? `4px solid ${stageWarning.isDanger ? stageWarning.dangerColor : stageWarning.color}` : undefined,
        background: stageWarning ? `${stageWarning.isDanger ? stageWarning.dangerColor : stageWarning.color}10` : undefined
      }}
      title={stageWarning ? `${stageWarning.daysInStage} days in this stage (threshold: ${stageWarning.thresholdDays} days)` : "Drag to move between phases"}
    >
      <div className="client-priority">{priority}</div>

      {/* Badges row */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
        {stageWarning && (
          <span style={{
            fontSize: '0.6rem',
            padding: '0.1rem 0.4rem',
            borderRadius: '4px',
            background: stageWarning.isDanger ? `${stageWarning.dangerColor}20` : `${stageWarning.color}20`,
            color: stageWarning.isDanger ? stageWarning.dangerColor : stageWarning.color,
            fontWeight: '600'
          }}>
            ⏰ {stageWarning.daysInStage}d IN STAGE
          </span>
        )}
        {isNew && (
          <span style={{
            fontSize: '0.6rem',
            padding: '0.1rem 0.4rem',
            borderRadius: '4px',
            background: 'rgba(34,197,94,0.15)',
            color: '#22c55e',
            fontWeight: '600'
          }}>
            ✨ NEW
          </span>
        )}
        {paymentIndicator && (
          <span style={{
            fontSize: '0.6rem',
            padding: '0.1rem 0.4rem',
            borderRadius: '4px',
            background: paymentIndicator.bg,
            color: paymentIndicator.color,
            fontWeight: '600'
          }}>
            {paymentIndicator.text}
          </span>
        )}
      </div>

      <div className="client-header">
        <div>
          <div className="client-name">{client.clientName}</div>
          <div className="client-business">{client.businessName}</div>
        </div>
        <span className={`client-package package-${client.package}`}>
          {pkg.emoji} {formatPrice(pkg.price)}
        </span>
      </div>
      <div className="client-meta">
        <span className={paymentClass}>{paymentIcon} {client.paymentStatus}</span>
        <span>📅 {client.paymentSchedule}</span>
        {client.monthsWithClient > 0 && (
          <span>⏱️ {client.monthsWithClient}mo</span>
        )}
        {(client.assignedUser || client.assignedTo) && (
          <span>👤 {client.assignedUser?.name || client.assignedUser?.email || client.assignedTo}</span>
        )}
      </div>
      {client.phase === 'testing' && (
        <div className="testing-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${client.subscriptionUsage || 0}%` }}
            />
          </div>
          <div className="progress-label">
            <span>Usage: {client.subscriptionUsage || 0}%</span>
            <span>Round #{client.testingRound || 1}</span>
          </div>
        </div>
      )}
      {client.tags && client.tags.length > 0 && (
        <div className="client-tags" style={{ marginTop: 'var(--space-sm)' }}>
          {client.tags.map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}
      <div className="client-actions" onMouseDown={(e) => e.stopPropagation()}>
        <button
          className="btn btn-sm btn-ghost"
          onClick={onView}
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
        >
          👁️ View
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={onEdit}
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
        >
          ✏️ Edit
        </button>
      </div>
    </div>
  );
};

export default ClientCard;

