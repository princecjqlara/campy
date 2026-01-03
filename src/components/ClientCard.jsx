import React from 'react';
import { getPackageInfo, formatPrice } from '../utils/clients';

const ClientCard = ({ client, onView, onEdit }) => {
  const pkg = getPackageInfo(client);
  const priority = client.priority || 1;

  const paymentClass = client.paymentStatus === 'paid' ? 'payment-paid' :
    client.paymentStatus === 'partial' ? 'payment-partial' : 'payment-unpaid';
  const paymentIcon = client.paymentStatus === 'paid' ? '✅' :
    client.paymentStatus === 'partial' ? '⚠️' : '❌';

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', client.id);
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
      style={{ cursor: 'grab' }}
      title="Drag to move between phases"
    >
      <div className="client-priority">{priority}</div>
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
        {client.assignedTo && (
          <span>👤 {client.assignedTo}</span>
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
      <div className="client-actions">
        <button className="btn btn-sm btn-ghost" onClick={onView}>👁️ View</button>
        <button className="btn btn-sm btn-ghost" onClick={onEdit}>✏️ Edit</button>
      </div>
    </div>
  );
};

export default ClientCard;

