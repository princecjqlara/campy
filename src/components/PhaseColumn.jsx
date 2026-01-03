import React, { useState } from 'react';
import ClientCard from './ClientCard';

const phaseConfig = {
  'proposal-sent': { emoji: '📧', title: 'PROPOSAL SENT' },
  booked: { emoji: '📅', title: 'BOOKED' },
  preparing: { emoji: '⏳', title: 'PREPARING' },
  testing: { emoji: '🧪', title: 'TESTING' },
  running: { emoji: '🚀', title: 'RUNNING' }
};

const PhaseColumn = ({ phase, clients, onViewClient, onEditClient, onMoveClient }) => {
  const config = phaseConfig[phase] || { emoji: '', title: phase.toUpperCase() };
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const clientId = e.dataTransfer.getData('text/plain');
    if (clientId && onMoveClient) {
      onMoveClient(clientId, phase);
    }
  };

  return (
    <div 
      className="phase-column" 
      data-phase={phase}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        borderColor: isDraggingOver ? 'var(--primary)' : '',
        borderWidth: isDraggingOver ? '2px' : '1px'
      }}
    >
      <div className="phase-header">
        <div className="phase-title">
          <span>{config.emoji}</span> {config.title}
        </div>
        <span className="phase-count">{clients.length}</span>
      </div>
      <div className="phase-clients">
        {clients.length === 0 ? (
          <div className="phase-empty">No clients in this phase</div>
        ) : (
          clients.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onView={() => onViewClient(client.id)}
              onEdit={() => onEditClient(client.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default PhaseColumn;

