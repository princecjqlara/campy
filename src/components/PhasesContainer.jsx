import React from 'react';
import PhaseColumn from './PhaseColumn';

const PhasesContainer = ({ clients, filters, onViewClient, onEditClient, onMoveClient }) => {
  const phases = ['proposal-sent', 'booked', 'preparing', 'testing', 'running'];
  
  const getClientsByPhase = (phase) => {
    let filtered = clients.filter(c => c.phase === phase);

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(client => {
        const searchable = [
          client.clientName,
          client.businessName,
          client.projectName,
          client.contactDetails,
          ...(client.tags || [])
        ].join(' ').toLowerCase();
        return searchable.includes(term);
      });
    }

    if (filters.filterPackage) {
      filtered = filtered.filter(c => c.package === filters.filterPackage);
    }

    if (filters.filterPayment) {
      filtered = filtered.filter(c => c.paymentStatus === filters.filterPayment);
    }

    filtered.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    return filtered;
  };

  return (
    <section className="phases-container" id="phasesContainer">
      {phases.map(phase => (
        <PhaseColumn
          key={phase}
          phase={phase}
          clients={getClientsByPhase(phase)}
          onViewClient={onViewClient}
          onEditClient={onEditClient}
          onMoveClient={onMoveClient}
        />
      ))}
    </section>
  );
};

export default PhasesContainer;

