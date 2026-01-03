import React, { useState, useRef } from 'react';
import ClientCard from './ClientCard';

const phaseConfig = {
  booked: { emoji: '📅', title: 'BOOKED' },
  'follow-up': { emoji: '📞', title: 'FOLLOW UP' },
  preparing: { emoji: '⏳', title: 'PREPARING' },
  testing: { emoji: '🧪', title: 'TESTING' },
  running: { emoji: '🚀', title: 'RUNNING' }
};

const PhaseColumn = ({ phase, clients, onViewClient, onEditClient, onMoveClient }) => {
  const config = phaseConfig[phase] || { emoji: '', title: phase.toUpperCase() };
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!isDraggingOver) {
      setIsDraggingOver(true);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we're actually leaving the container (not just entering a child)
    const currentTarget = e.currentTarget;
    const relatedTarget = e.relatedTarget;
    
    // If relatedTarget is null or not a child of currentTarget, we're leaving
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounterRef.current = 0;

    const clientId = e.dataTransfer.getData('text/plain');
    if (clientId && onMoveClient) {
      onMoveClient(clientId, phase);
    }
  };

  return (
    <div 
      className="phase-column" 
      data-phase={phase}
      style={{
        borderColor: isDraggingOver ? 'var(--primary)' : '',
        borderWidth: isDraggingOver ? '2px' : '1px',
        transition: 'border-color 0.2s ease'
      }}
    >
      <div className="phase-header">
        <div className="phase-title">
          <span>{config.emoji}</span> {config.title}
        </div>
        <span className="phase-count">{clients.length}</span>
      </div>
      <div 
        className="phase-clients"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ minHeight: '100px' }}
      >
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

