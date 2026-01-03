import React, { useState, useMemo, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

const CalendarView = ({ clients, isOpen, onClose, currentUserId }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // month, week, day
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadEvents();
    }
  }, [isOpen, currentDate]);

  useEffect(() => {
    if (isOpen && clients) {
      const clientEvents = generateClientEvents();
      setEvents(prev => {
        // Filter out old client events and add new ones
        const dbEvents = prev.filter(e => !e.id?.startsWith('payment-') && !e.id?.startsWith('phase-') && !e.id?.startsWith('milestone-'));
        return [...dbEvents, ...clientEvents];
      });
    }
  }, [isOpen, clients, currentDate]);

  const loadEvents = async () => {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      setLoading(true);
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const { data, error } = await client
        .from('calendar_events')
        .select('*')
        .gte('start_time', startOfMonth.toISOString())
        .lte('start_time', endOfMonth.toISOString())
        .order('start_time');

      if (error) {
        // If table doesn't exist yet, just continue with client-generated events
        if (error.code === '42P01') {
          console.warn('Calendar events table not found. Run database migration.');
          setEvents([]);
        } else {
          console.error('Error loading calendar events:', error);
          setEvents([]);
        }
      } else {
        setEvents(data || []);
      }
    } catch (error) {
      console.error('Error loading calendar events:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateClientEvents = () => {
    // Generate events from clients (payment due dates, phase transitions, etc.)
    const clientEvents = [];

    if (!clients || !Array.isArray(clients)) return clientEvents;

    clients.forEach(client => {
      if (!client) return;
      
      if (client.startDate) {
        const startDate = new Date(client.startDate);
        if (isNaN(startDate.getTime())) return; // Invalid date
        
        // Payment due dates (monthly)
        if (client.paymentSchedule === 'monthly') {
          for (let i = 0; i < 12; i++) {
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + i);
            
            if (dueDate.getMonth() === currentDate.getMonth() && 
                dueDate.getFullYear() === currentDate.getFullYear()) {
              clientEvents.push({
                id: `payment-${client.id}-${i}`,
                title: `💰 Payment Due: ${client.clientName || 'Unknown'}`,
                start_time: dueDate.toISOString(),
                event_type: 'payment_due',
                client_id: client.id,
                color: client.paymentStatus === 'paid' ? 'green' : client.paymentStatus === 'partial' ? 'orange' : 'red'
              });
            }
          }
        }

        // Phase transition dates
        if (client.nextPhaseDate) {
          const phaseDate = new Date(client.nextPhaseDate);
          if (!isNaN(phaseDate.getTime()) && 
              phaseDate.getMonth() === currentDate.getMonth() && 
              phaseDate.getFullYear() === currentDate.getFullYear()) {
            clientEvents.push({
              id: `phase-${client.id}`,
              title: `🔄 Phase Transition: ${client.clientName || 'Unknown'}`,
              start_time: phaseDate.toISOString(),
              event_type: 'phase_transition',
              client_id: client.id,
              color: 'blue'
            });
          }
        }

        // Client milestones (anniversaries)
        const anniversary = new Date(startDate);
        anniversary.setFullYear(currentDate.getFullYear());
        if (anniversary.getMonth() === currentDate.getMonth() && 
            anniversary.getFullYear() === currentDate.getFullYear()) {
          clientEvents.push({
            id: `milestone-${client.id}`,
            title: `🎯 ${client.monthsWithClient || 0} Month Anniversary: ${client.clientName || 'Unknown'}`,
            start_time: anniversary.toISOString(),
            event_type: 'milestone',
            client_id: client.id,
            color: 'purple'
          });
        }
      }
    });

    return clientEvents;
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const getEventsForDate = (date) => {
    if (!date) return [];
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(event => {
      const eventDate = new Date(event.start_time).toISOString().split('T')[0];
      return eventDate === dateStr;
    });
  };

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!isOpen) return null;

  const days = getDaysInMonth();

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">📅 Calendar View</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Calendar Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={() => navigateMonth(-1)}>
              ← Previous
            </button>
            <h4 style={{ margin: 0 }}>
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h4>
            <button className="btn btn-secondary" onClick={() => navigateMonth(1)}>
              Next →
            </button>
          </div>

          {/* Calendar Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: '0.5rem',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '0.5rem'
          }}>
            {/* Day Headers */}
            {dayNames.map(day => (
              <div key={day} style={{ 
                padding: '0.5rem', 
                textAlign: 'center', 
                fontWeight: '600',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem'
              }}>
                {day}
              </div>
            ))}

            {/* Calendar Days */}
            {days.map((date, index) => {
              const dayEvents = getEventsForDate(date);
              const isToday = date && 
                date.getDate() === new Date().getDate() &&
                date.getMonth() === new Date().getMonth() &&
                date.getFullYear() === new Date().getFullYear();

              return (
                <div
                  key={index}
                  style={{
                    minHeight: '100px',
                    padding: '0.5rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    background: isToday ? 'rgba(var(--primary-rgb), 0.1)' : 'var(--bg-primary)',
                    position: 'relative'
                  }}
                >
                  {date && (
                    <>
                      <div style={{ 
                        fontWeight: isToday ? 'bold' : 'normal',
                        marginBottom: '0.25rem',
                        color: isToday ? 'var(--primary)' : 'var(--text-primary)'
                      }}>
                        {date.getDate()}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.125rem 0.25rem',
                              background: event.color || 'var(--primary)',
                              color: 'white',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={event.title}
                          >
                            {event.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <h5 style={{ marginBottom: '0.5rem' }}>Legend</h5>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '16px', height: '16px', background: 'red', borderRadius: '3px' }}></div>
                <span style={{ fontSize: '0.875rem' }}>Payment Due (Unpaid)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '16px', height: '16px', background: 'orange', borderRadius: '3px' }}></div>
                <span style={{ fontSize: '0.875rem' }}>Payment Due (Partial)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '16px', height: '16px', background: 'green', borderRadius: '3px' }}></div>
                <span style={{ fontSize: '0.875rem' }}>Payment Due (Paid)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '16px', height: '16px', background: 'blue', borderRadius: '3px' }}></div>
                <span style={{ fontSize: '0.875rem' }}>Phase Transition</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '16px', height: '16px', background: 'purple', borderRadius: '3px' }}></div>
                <span style={{ fontSize: '0.875rem' }}>Milestone</span>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;

