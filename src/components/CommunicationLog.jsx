import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

const CommunicationLog = ({ clientId, isOpen, onClose, currentUserId }) => {
  const [communications, setCommunications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    type: 'note',
    subject: '',
    content: '',
    direction: 'internal',
    contact_method: '',
    occurred_at: new Date().toISOString().slice(0, 16)
  });

  useEffect(() => {
    if (isOpen && clientId) {
      loadCommunications();
    }
  }, [isOpen, clientId]);

  const loadCommunications = async () => {
    const client = getSupabaseClient();
    if (!client || !clientId) return;

    try {
      setLoading(true);
      const { data, error } = await client
        .from('communications')
        .select('*, users:user_id(name, email)')
        .eq('client_id', clientId)
        .order('occurred_at', { ascending: false });

      if (error) throw error;
      setCommunications(data || []);
    } catch (error) {
      console.error('Error loading communications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client || !clientId) return;

    try {
      const { error } = await client
        .from('communications')
        .insert({
          client_id: clientId,
          user_id: currentUserId,
          ...formData,
          occurred_at: formData.occurred_at || new Date().toISOString()
        });

      if (error) throw error;
      
      setFormData({
        type: 'note',
        subject: '',
        content: '',
        direction: 'internal',
        contact_method: '',
        occurred_at: new Date().toISOString().slice(0, 16)
      });
      setShowForm(false);
      loadCommunications();
    } catch (error) {
      console.error('Error creating communication:', error);
      alert('Failed to save communication: ' + error.message);
    }
  };

  const getTypeIcon = (type) => {
    const icons = {
      note: '📝',
      email: '📧',
      call: '📞',
      meeting: '🤝',
      message: '💬',
      update: '🔄'
    };
    return icons[type] || '📝';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh' }}>
        <div className="modal-header">
          <h3 className="modal-title">💬 Communication Log</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Add Communication Button */}
          <div style={{ marginBottom: '1rem' }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? '✕ Cancel' : '+ Add Communication'}
            </button>
          </div>

          {/* Add Communication Form */}
          {showForm && (
            <form onSubmit={handleSubmit} style={{ 
              padding: '1rem', 
              background: 'var(--bg-secondary)', 
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                >
                  <option value="note">📝 Note</option>
                  <option value="email">📧 Email</option>
                  <option value="call">📞 Call</option>
                  <option value="meeting">🤝 Meeting</option>
                  <option value="message">💬 Message</option>
                  <option value="update">🔄 Update</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Subject</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Brief subject or title"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Content</label>
                <textarea
                  className="form-input"
                  rows="4"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Communication details..."
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Direction</label>
                  <select
                    className="form-select"
                    value={formData.direction}
                    onChange={(e) => setFormData({ ...formData, direction: e.target.value })}
                  >
                    <option value="internal">Internal</option>
                    <option value="inbound">Inbound</option>
                    <option value="outbound">Outbound</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Date & Time</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={formData.occurred_at}
                    onChange={(e) => setFormData({ ...formData, occurred_at: e.target.value })}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                Save Communication
              </button>
            </form>
          )}

          {/* Communications List */}
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Loading communications...</div>
          ) : communications.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No communications yet. Add one to get started!
            </div>
          ) : (
            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {communications.map(comm => (
                <div
                  key={comm.id}
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    marginBottom: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '1.5rem' }}>{getTypeIcon(comm.type)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          {comm.subject && (
                            <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600' }}>
                              {comm.subject}
                            </h4>
                          )}
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {comm.users?.name || 'Unknown'} • {formatDate(comm.occurred_at)}
                            {comm.direction !== 'internal' && (
                              <span style={{ marginLeft: '0.5rem' }}>
                                ({comm.direction})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p style={{ 
                        margin: '0.5rem 0 0 0', 
                        fontSize: '0.8125rem', 
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {comm.content}
                      </p>
                      {comm.tags && comm.tags.length > 0 && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {comm.tags.map(tag => (
                            <span key={tag} className="tag" style={{ fontSize: '0.75rem' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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

export default CommunicationLog;

