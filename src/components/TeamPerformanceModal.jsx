import React, { useState, useMemo } from 'react';
import { formatPrice, getPackagePrice } from '../utils/clients';

const TeamPerformanceModal = ({ clients, users, onClose }) => {
  const [selectedUser, setSelectedUser] = useState('all');

  // Calculate team performance metrics
  const teamMetrics = useMemo(() => {
    const metrics = {};

    // Initialize metrics for all users
    users.forEach(user => {
      metrics[user.id] = {
        userId: user.id,
        userName: user.name || user.email,
        userEmail: user.email,
        totalClients: 0,
        booked: 0,
        preparing: 0,
        testing: 0,
        running: 0,
        paidClients: 0,
        monthlyRevenue: 0,
        totalExpenses: 0,
        netProfit: 0
      };
    });

    // Add "All Team" option
    metrics.all = {
      userId: 'all',
      userName: 'All Team',
      userEmail: '',
      totalClients: 0,
      booked: 0,
      preparing: 0,
      testing: 0,
      running: 0,
      paidClients: 0,
      monthlyRevenue: 0,
      totalExpenses: 0,
      netProfit: 0
    };

    // Calculate metrics from clients
    clients.forEach(client => {
      // Handle assignedTo - could be UUID or name string
      let assignedUserId = 'unassigned';
      if (client.assignedTo) {
        // Check if it's a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(client.assignedTo)) {
          assignedUserId = client.assignedTo;
        } else {
          // It's a name string, find matching user by name or email
          const matchingUser = users.find(u => 
            u.name === client.assignedTo || u.email === client.assignedTo
          );
          assignedUserId = matchingUser ? matchingUser.id : 'unassigned';
        }
      }
      
      // Update individual user metrics
      if (metrics[assignedUserId]) {
        metrics[assignedUserId].totalClients++;
        if (client.phase === 'booked') metrics[assignedUserId].booked++;
        if (client.phase === 'preparing') metrics[assignedUserId].preparing++;
        if (client.phase === 'testing') metrics[assignedUserId].testing++;
        if (client.phase === 'running') metrics[assignedUserId].running++;
        if (client.paymentStatus === 'paid') metrics[assignedUserId].paidClients++;
        
        // Revenue from running paid clients
        if (client.phase === 'running' && client.paymentStatus === 'paid') {
          const revenue = getPackagePrice(client);
          metrics[assignedUserId].monthlyRevenue += revenue;
        }
      }

      // Update "All Team" metrics
      metrics.all.totalClients++;
      if (client.phase === 'booked') metrics.all.booked++;
      if (client.phase === 'preparing') metrics.all.preparing++;
      if (client.phase === 'testing') metrics.all.testing++;
      if (client.phase === 'running') metrics.all.running++;
      if (client.paymentStatus === 'paid') metrics.all.paidClients++;
      
      if (client.phase === 'running' && client.paymentStatus === 'paid') {
        const revenue = getPackagePrice(client);
        metrics.all.monthlyRevenue += revenue;
      }
    });

    // Calculate expenses for each metric
    const expenses = JSON.parse(localStorage.getItem('campy_expenses') || '{}');
    Object.values(metrics).forEach(metric => {
      // Find clients assigned to this user/metric
      const runningClients = clients.filter(c => {
        if (c.phase !== 'running' || c.paymentStatus !== 'paid') return false;
        
        if (metric.userId === 'all') return true;
        
        // Handle assignedTo - could be UUID or name string
        if (!c.assignedTo) return metric.userId === 'unassigned';
        
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(c.assignedTo)) {
          return c.assignedTo === metric.userId;
        } else {
          // It's a name string
          const matchingUser = users.find(u => 
            (u.name === c.assignedTo || u.email === c.assignedTo) && u.id === metric.userId
          );
          return !!matchingUser;
        }
      });
      
      metric.totalExpenses = runningClients.reduce((total, client) => {
        const pkgExpense = expenses[client.package] || 0;
        const adsExpense = client.adsExpense || 0;
        return total + pkgExpense + adsExpense;
      }, 0);
      
      metric.netProfit = metric.monthlyRevenue - metric.totalExpenses;
    });

    return metrics;
  }, [clients, users]);

  const currentMetrics = teamMetrics[selectedUser] || teamMetrics.all;
  const teamMembers = Object.values(teamMetrics).filter(m => m.userId !== 'all' && m.userId !== 'unassigned');

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">👥 Team Performance</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Team Member Selector */}
          <div style={{ marginBottom: '2rem' }}>
            <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
              View Performance For:
            </label>
            <select
              className="form-select"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{ width: '100%', maxWidth: '400px' }}
            >
              <option value="all">All Team Members</option>
              {teamMembers.map(member => (
                <option key={member.userId} value={member.userId}>
                  {member.userName} ({member.userEmail})
                </option>
              ))}
            </select>
          </div>

          {/* Performance Stats Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div className="stat-card" style={{ padding: '1rem' }}>
              <div className="stat-icon">👥</div>
              <div className="stat-value">{currentMetrics.totalClients}</div>
              <div className="stat-label">Total Clients</div>
            </div>
            <div className="stat-card" style={{ padding: '1rem' }}>
              <div className="stat-icon">📅</div>
              <div className="stat-value">{currentMetrics.booked}</div>
              <div className="stat-label">Booked</div>
            </div>
            <div className="stat-card" style={{ padding: '1rem' }}>
              <div className="stat-icon">⏳</div>
              <div className="stat-value">{currentMetrics.preparing}</div>
              <div className="stat-label">Preparing</div>
            </div>
            <div className="stat-card" style={{ padding: '1rem' }}>
              <div className="stat-icon">🧪</div>
              <div className="stat-value">{currentMetrics.testing}</div>
              <div className="stat-label">Testing</div>
            </div>
            <div className="stat-card" style={{ padding: '1rem' }}>
              <div className="stat-icon">🚀</div>
              <div className="stat-value">{currentMetrics.running}</div>
              <div className="stat-label">Running</div>
            </div>
            <div className="stat-card" style={{ padding: '1rem' }}>
              <div className="stat-icon">✅</div>
              <div className="stat-value">{currentMetrics.paidClients}</div>
              <div className="stat-label">Paid Clients</div>
            </div>
            <div className="stat-card" style={{ padding: '1rem' }}>
              <div className="stat-icon">💰</div>
              <div className="stat-value">{formatPrice(currentMetrics.monthlyRevenue)}</div>
              <div className="stat-label">Monthly Revenue</div>
            </div>
            <div className="stat-card" style={{ padding: '1rem' }}>
              <div className="stat-icon">📉</div>
              <div className="stat-value">{formatPrice(currentMetrics.totalExpenses)}</div>
              <div className="stat-label">Total Expenses</div>
            </div>
            <div className="stat-card" style={{ padding: '1rem', border: '2px solid var(--success)' }}>
              <div className="stat-icon">📈</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {formatPrice(currentMetrics.netProfit)}
              </div>
              <div className="stat-label">Net Profit</div>
            </div>
          </div>

          {/* Team Members Breakdown */}
          {selectedUser === 'all' && (
            <div>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Team Members Breakdown</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left' }}>Team Member</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Total Clients</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Running</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Paid</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Revenue</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers
                      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
                      .map(member => (
                        <tr key={member.userId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ fontWeight: '500' }}>{member.userName}</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                              {member.userEmail}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{member.totalClients}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{member.running}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{member.paidClients}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>
                            {formatPrice(member.monthlyRevenue)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500', color: 'var(--success)' }}>
                            {formatPrice(member.netProfit)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamPerformanceModal;

