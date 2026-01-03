import { useState, useEffect } from 'react';
import { getPackagePrice } from '../utils/clients';

export const useMetrics = (clients) => {
  const [metrics, setMetrics] = useState({
    totalClients: 0,
    proposalSent: 0,
    booked: 0,
    preparing: 0,
    testing: 0,
    running: 0,
    monthlyRevenue: 0,
    totalExpenses: 0,
    netProfit: 0
  });

  const updateMetrics = () => {
    const runningPaidClients = clients.filter(c => c.phase === 'running' && c.paymentStatus === 'paid');
    
    const expenses = JSON.parse(localStorage.getItem('campy_expenses') || '{}');
    const revenue = runningPaidClients.reduce((total, client) => {
      return total + getPackagePrice(client);
    }, 0);

    const totalExpenses = runningPaidClients.reduce((total, client) => {
      const pkgExpense = expenses[client.package] || 0;
      const adsExpense = client.adsExpense || 0;
      return total + pkgExpense + adsExpense;
    }, 0);

    setMetrics({
      totalClients: clients.length,
      proposalSent: clients.filter(c => c.phase === 'proposal-sent').length,
      booked: clients.filter(c => c.phase === 'booked').length,
      preparing: clients.filter(c => c.phase === 'preparing').length,
      testing: clients.filter(c => c.phase === 'testing').length,
      running: clients.filter(c => c.phase === 'running').length,
      monthlyRevenue: revenue,
      totalExpenses: totalExpenses,
      netProfit: revenue - totalExpenses
    });
  };

  useEffect(() => {
    updateMetrics();
  }, [clients]);

  return { metrics, updateMetrics };
};

