import { useStorage } from './useStorage';

export const usePhases = (clients, filters) => {
  const { updateClient } = useStorage();

  const getClientsByPhase = (phase) => {
    let filtered = clients.filter(c => c.phase === phase);

    // Apply filters
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

    // Sort by priority
    filtered.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    return filtered;
  };

  const moveToNextPhase = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return null;

    const order = ['proposal-sent', 'booked', 'preparing', 'testing', 'running'];
    const currentIndex = order.indexOf(client.phase);
    if (currentIndex < order.length - 1) {
      const nextPhase = order[currentIndex + 1];
      updateClient(clientId, {
        phase: nextPhase,
        phaseEnteredAt: new Date().toISOString()
      });
      return nextPhase;
    }
    return null;
  };

  const moveClientToPhase = (clientId, targetPhase) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return null;

    // Don't move if already in target phase
    if (client.phase === targetPhase) return null;

    const fromPhase = client.phase;
    const updates = {
      phase: targetPhase,
      phaseEnteredAt: new Date().toISOString()
    };

    // Handle resubscription (reset to preparing)
    if (targetPhase === 'preparing' && fromPhase !== 'preparing') {
      updates.resubscriptionCount = (client.resubscriptionCount || 0) + 1;
    }

    // Handle testing phase
    if (targetPhase === 'testing') {
      updates.subscriptionStarted = true;
      if (fromPhase === 'preparing') {
        updates.subscriptionUsage = 0;
        updates.testingRound = 1;
      }
    }

    // Update auto switch date if enabled
    if (client.autoSwitch) {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + (client.autoSwitchDays || 7));
      updates.nextPhaseDate = nextDate.toISOString().split('T')[0];
    }

    updateClient(clientId, updates);
    return targetPhase;
  };

  const renderAllPhases = () => {
    // This will be handled by the PhasesContainer component
    return {
      'proposal-sent': getClientsByPhase('proposal-sent'),
      booked: getClientsByPhase('booked'),
      preparing: getClientsByPhase('preparing'),
      testing: getClientsByPhase('testing'),
      running: getClientsByPhase('running')
    };
  };

  return {
    getClientsByPhase,
    moveToNextPhase,
    moveClientToPhase,
    renderAllPhases
  };
};

