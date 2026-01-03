import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

const CalendarView = ({ clients, isOpen, onClose, currentUserId, users = [] }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [meetingForm, setMeetingForm] = useState({
    title: '',
    description: '',
    client_id: '',
    attendees: [],
    start_time: '',
    end_time: '',
    event_type: 'meeting'
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadEvents();
    }
  }, [isOpen, currentDate]);

  useEffect(() => {
    if (isOpen && clients) {
      const clientEvents = generateClientEvents();
      setEvents(prev => {
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
    const clientEvents = [];
    if (!clients || !Array.isArray(clients)) return clientEvents;

    clients.forEach(client => {
      if (!client) return;

      if (client.startDate) {
        const startDate = new Date(client.startDate);
        if (isNaN(startDate.getTime())) return;

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

  const handleScheduleMeeting = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    setSelectedDate(date);
    setMeetingForm({
      title: '',
      description: '',
      client_id: '',
      attendees: currentUserId ? [currentUserId] : [],
      start_time: `${dateStr}T09:00`,
      end_time: `${dateStr}T10:00`,
      event_type: 'meeting'
    });
    setShowMeetingForm(true);
  };

  const handleSaveMeeting = async () => {
    const client = getSupabaseClient();
    if (!client) {
      alert('Not connected to database');
      return;
    }

    if (!meetingForm.title.trim()) {
      alert('Please enter a meeting title');
      return;
    }

    try {
      setSaving(true);

      const eventData = {
        title: meetingForm.title,
        description: meetingForm.description,
        client_id: meetingForm.client_id || null,
        attendees: meetingForm.attendees,
        start_time: new Date(meetingForm.start_time).toISOString(),
        end_time: new Date(meetingForm.end_time).toISOString(),
        event_type: 'meeting',
        created_by: currentUserId
      };

      const { data, error } = await client
        .from('calendar_events')
        .insert(eventData)
        .select()
        .single();

      if (error) {
        console.error('Error saving meeting:', error);
        alert('Failed to save meeting: ' + error.message);
        return;
      }

      // Add to local events
      setEvents(prev => [...prev, { ...data, color: '#3b82f6' }]);
      setShowMeetingForm(false);

      // TODO: Send notifications to attendees
      alert('Meeting scheduled successfully!');

    } catch (error) {
      console.error('Error saving meeting:', error);
      alert('Failed to save meeting');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!eventId || eventId.startsWith('payment-') || eventId.startsWith('phase-') || eventId.startsWith('milestone-')) {
      return; // Don't delete auto-generated events
    }

    if (!confirm('Delete this event?')) return;

    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { error } = await client
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) {
        console.error('Error deleting event:', error);
        return;
      }

      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
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

  const getEventColor = (event) => {
    if (event.color) return event.color;
    switch (event.event_type) {
      case 'meeting': return '#3b82f6';
      case 'payment_due': return '#ef4444';
      case 'phase_transition': return '#3b82f6';
      case 'milestone': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!isOpen) return null;

  const days = getDaysInMonth();

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1100px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">📅 Calendar</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Calendar Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={() => navigateMonth(-1)}>
              ← Previous
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h4 style={{ margin: 0 }}>
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h4>
              <button
                className="btn btn-primary"
                onClick={() => handleScheduleMeeting(new Date())}
              >
                + Schedule Meeting
              </button>
            </div>
            <button className="btn btn-secondary" onClick={() => navigateMonth(1)}>
              Next →
            </button>
          </div>

          {/* Calendar Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '0.25rem',
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
                  onClick={() => date && handleScheduleMeeting(date)}
                  style={{
                    minHeight: '90px',
                    padding: '0.25rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    background: isToday ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary)',
                    cursor: date ? 'pointer' : 'default',
                    position: 'relative'
                  }}
                >
                  {date && (
                    <>
                      <div style={{
                        fontWeight: isToday ? 'bold' : 'normal',
                        marginBottom: '0.25rem',
                        fontSize: '0.875rem',
                        color: isToday ? 'var(--primary)' : 'var(--text-primary)'
                      }}>
                        {date.getDate()}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (event.event_type === 'meeting') {
                                if (confirm(`${event.title}\n\nDelete this meeting?`)) {
                                  handleDeleteEvent(event.id);
                                }
                              }
                            }}
                            style={{
                              fontSize: '0.65rem',
                              padding: '0.125rem 0.25rem',
                              background: getEventColor(event),
                              color: 'white',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={event.title}
                          >
                            {event.event_type === 'meeting' ? '📅 ' : ''}{event.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
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
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{ width: '12px', height: '12px', background: '#3b82f6', borderRadius: '2px' }}></div>
                <span>Meeting</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '2px' }}></div>
                <span>Payment Due</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{ width: '12px', height: '12px', background: '#22c55e', borderRadius: '2px' }}></div>
                <span>Paid</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{ width: '12px', height: '12px', background: '#8b5cf6', borderRadius: '2px' }}></div>
                <span>Milestone</span>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* Meeting Scheduling Modal */}
      {showMeetingForm && (
        <div className="modal-overlay active" onClick={() => setShowMeetingForm(false)} style={{ zIndex: 1001 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">📅 Schedule Meeting</h3>
              <button className="modal-close" onClick={() => setShowMeetingForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Meeting Title *</label>
                <input
                  type="text"
                  className="form-input"
                  value={meetingForm.title}
                  onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })}
                  placeholder="e.g. Client Onboarding Call"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  value={meetingForm.description}
                  onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })}
                  placeholder="Meeting agenda or notes..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Client (Optional)</label>
                <select
                  className="form-select"
                  value={meetingForm.client_id}
                  onChange={(e) => setMeetingForm({ ...meetingForm, client_id: e.target.value })}
                >
                  <option value="">— No Client —</option>
                  {clients?.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.clientName || client.businessName || 'Unknown'}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Start Time *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={meetingForm.start_time}
                    onChange={(e) => setMeetingForm({ ...meetingForm, start_time: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time *</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={meetingForm.end_time}
                    onChange={(e) => setMeetingForm({ ...meetingForm, end_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Attendees</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {users?.map(user => (
                    <label key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
                      <input
                        type="checkbox"
                        checked={meetingForm.attendees.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMeetingForm({ ...meetingForm, attendees: [...meetingForm.attendees, user.id] });
                          } else {
                            setMeetingForm({ ...meetingForm, attendees: meetingForm.attendees.filter(id => id !== user.id) });
                          }
                        }}
                      />
                      {user.name}
                    </label>
                  ))}
                  {(!users || users.length === 0) && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No team members available</span>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowMeetingForm(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveMeeting}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Schedule Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
