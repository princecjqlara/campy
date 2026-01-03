import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

const CalendarView = ({ clients, isOpen, onClose, currentUserId, users = [] }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showMeetingDetails, setShowMeetingDetails] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [meetingForm, setMeetingForm] = useState({
    title: '',
    description: '',
    client_id: '',
    attendees: [],
    start_time: '',
    end_time: '',
    event_type: 'meeting',
    status: 'scheduled',
    notes: ''
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
        const dbEvents = prev.filter(e => !e.id?.startsWith?.('payment-') && !e.id?.startsWith?.('phase-') && !e.id?.startsWith?.('milestone-'));
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
          console.warn('Calendar events table not found.');
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
                title: `💰 Payment: ${client.clientName || 'Unknown'}`,
                start_time: dueDate.toISOString(),
                event_type: 'payment_due',
                client_id: client.id,
                color: client.paymentStatus === 'paid' ? '#22c55e' : client.paymentStatus === 'partial' ? '#f59e0b' : '#ef4444'
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
              title: `🔄 Phase: ${client.clientName || 'Unknown'}`,
              start_time: phaseDate.toISOString(),
              event_type: 'phase_transition',
              client_id: client.id,
              color: '#3b82f6'
            });
          }
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
      event_type: 'meeting',
      status: 'scheduled',
      notes: ''
    });
    setShowMeetingForm(true);
  };

  const handleViewMeeting = (event) => {
    setSelectedMeeting(event);
    setShowMeetingDetails(true);
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
        status: meetingForm.status || 'scheduled',
        notes: meetingForm.notes || '',
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

      setEvents(prev => [...prev, { ...data, color: '#3b82f6' }]);
      setShowMeetingForm(false);
      alert('Meeting scheduled!');

    } catch (error) {
      console.error('Error saving meeting:', error);
      alert('Failed to save meeting');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMeeting = async (status, notes) => {
    const client = getSupabaseClient();
    if (!client || !selectedMeeting) return;

    try {
      setSaving(true);

      const { error } = await client
        .from('calendar_events')
        .update({
          status: status,
          notes: notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedMeeting.id);

      if (error) {
        console.error('Error updating meeting:', error);
        alert('Failed to update meeting');
        return;
      }

      // Update local state
      setEvents(prev => prev.map(e =>
        e.id === selectedMeeting.id ? { ...e, status, notes } : e
      ));
      setShowMeetingDetails(false);
      setSelectedMeeting(null);
      alert('Meeting updated!');

    } catch (error) {
      console.error('Error updating meeting:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!eventId || typeof eventId === 'string' && (eventId.startsWith('payment-') || eventId.startsWith('phase-') || eventId.startsWith('milestone-'))) {
      return;
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
      setShowMeetingDetails(false);
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const getClientName = (clientId) => {
    const client = clients?.find(c => c.id === clientId);
    return client?.clientName || client?.businessName || 'Unknown';
  };

  const getUserName = (userId) => {
    const user = users?.find(u => u.id === userId);
    return user?.name || 'Unknown';
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
    if (event.status === 'done') return '#22c55e';
    if (event.status === 'cancelled') return '#6b7280';
    if (event.status === 'rescheduled') return '#f59e0b';
    if (event.color) return event.color;
    if (event.event_type === 'meeting') return '#3b82f6';
    return '#6b7280';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'done': return { bg: '#22c55e', text: 'Done' };
      case 'rescheduled': return { bg: '#f59e0b', text: 'Rescheduled' };
      case 'cancelled': return { bg: '#6b7280', text: 'Cancelled' };
      default: return { bg: '#3b82f6', text: 'Scheduled' };
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
          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => navigateMonth(-1)}>← Prev</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h4 style={{ margin: 0 }}>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h4>
              <button className="btn btn-primary" onClick={() => handleScheduleMeeting(new Date())}>+ Meeting</button>
            </div>
            <button className="btn btn-secondary" onClick={() => navigateMonth(1)}>Next →</button>
          </div>

          {/* Calendar Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            {dayNames.map(day => (
              <div key={day} style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '600', background: 'var(--bg-secondary)', fontSize: '0.75rem' }}>{day}</div>
            ))}
            {days.map((date, index) => {
              const dayEvents = getEventsForDate(date);
              const isToday = date && date.toDateString() === new Date().toDateString();

              return (
                <div
                  key={index}
                  onClick={() => date && handleScheduleMeeting(date)}
                  style={{
                    minHeight: '80px',
                    padding: '0.25rem',
                    background: isToday ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary)',
                    cursor: date ? 'pointer' : 'default',
                    borderTop: '1px solid var(--border-color)'
                  }}
                >
                  {date && (
                    <>
                      <div style={{ fontWeight: isToday ? 'bold' : 'normal', fontSize: '0.75rem', marginBottom: '0.25rem', color: isToday ? 'var(--primary)' : 'var(--text-primary)' }}>
                        {date.getDate()}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (event.event_type === 'meeting') {
                                handleViewMeeting(event);
                              }
                            }}
                            style={{
                              fontSize: '0.6rem',
                              padding: '1px 3px',
                              background: getEventColor(event),
                              color: 'white',
                              borderRadius: '2px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer'
                            }}
                            title={event.title}
                          >
                            {event.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>+{dayEvents.length - 3}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* Meeting Form Modal */}
      {showMeetingForm && (
        <div className="modal-overlay active" onClick={() => setShowMeetingForm(false)} style={{ zIndex: 1001 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">📅 Schedule Meeting</h3>
              <button className="modal-close" onClick={() => setShowMeetingForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input type="text" className="form-input" value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} placeholder="Meeting title" />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" value={meetingForm.description} onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })} rows={2} />
              </div>
              <div className="form-group">
                <label className="form-label">Client</label>
                <select className="form-select" value={meetingForm.client_id} onChange={(e) => setMeetingForm({ ...meetingForm, client_id: e.target.value })}>
                  <option value="">— Select Client —</option>
                  {clients?.map(c => <option key={c.id} value={c.id}>{c.clientName || c.businessName}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Start</label>
                  <input type="datetime-local" className="form-input" value={meetingForm.start_time} onChange={(e) => setMeetingForm({ ...meetingForm, start_time: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">End</label>
                  <input type="datetime-local" className="form-input" value={meetingForm.end_time} onChange={(e) => setMeetingForm({ ...meetingForm, end_time: e.target.value })} />
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
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMeetingForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveMeeting} disabled={saving}>{saving ? 'Saving...' : 'Schedule'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Details Modal */}
      {showMeetingDetails && selectedMeeting && (
        <MeetingDetailsModal
          meeting={selectedMeeting}
          onClose={() => { setShowMeetingDetails(false); setSelectedMeeting(null); }}
          onUpdate={handleUpdateMeeting}
          onDelete={() => handleDeleteEvent(selectedMeeting.id)}
          getClientName={getClientName}
          getUserName={getUserName}
          saving={saving}
        />
      )}
    </div>
  );
};

// Meeting Details Modal Component
const MeetingDetailsModal = ({ meeting, onClose, onUpdate, onDelete, getClientName, getUserName, saving }) => {
  const [notes, setNotes] = useState(meeting.notes || '');
  const [status, setStatus] = useState(meeting.status || 'scheduled');

  const formatDateTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const statusBadge = {
    scheduled: { bg: '#3b82f6', text: 'Scheduled' },
    done: { bg: '#22c55e', text: 'Done' },
    rescheduled: { bg: '#f59e0b', text: 'Rescheduled' },
    cancelled: { bg: '#6b7280', text: 'Cancelled' }
  };

  return (
    <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 1001 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3 className="modal-title">📅 Meeting Details</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>{meeting.title}</h4>
            <span style={{
              display: 'inline-block',
              padding: '0.25rem 0.5rem',
              background: statusBadge[status]?.bg || '#6b7280',
              color: 'white',
              borderRadius: '4px',
              fontSize: '0.75rem'
            }}>
              {statusBadge[status]?.text || 'Unknown'}
            </span>
          </div>

          {meeting.description && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Description</label>
              <p style={{ margin: '0.25rem 0' }}>{meeting.description}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Start</label>
              <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>{formatDateTime(meeting.start_time)}</p>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>End</label>
              <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>{formatDateTime(meeting.end_time)}</p>
            </div>
          </div>

          {meeting.client_id && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Client</label>
              <p style={{ margin: '0.25rem 0' }}>{getClientName(meeting.client_id)}</p>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Meeting Notes</label>
            <textarea
              className="form-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What was discussed? Key decisions, action items..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Update Status</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['scheduled', 'done', 'rescheduled', 'cancelled'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: status === s ? statusBadge[s].bg : 'var(--bg-secondary)',
                    color: status === s ? 'white' : 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  {statusBadge[s].text}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={onDelete} style={{ background: '#ef4444', color: 'white' }}>Delete</button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onUpdate(status, notes)} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
