import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

const TagManagementModal = ({ isOpen, onClose, onTagsUpdated }) => {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTags();
    }
  }, [isOpen]);

  const loadTags = async () => {
    const client = getSupabaseClient();
    if (!client) {
      // Offline mode - load from localStorage
      const stored = localStorage.getItem('campy_tags');
      if (stored) {
        try {
          setTags(JSON.parse(stored));
        } catch (e) {
          console.error('Error loading tags from localStorage:', e);
          setTags([]);
        }
      } else {
        setTags([]);
      }
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await client
        .from('tags')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setTags(data || []);
      
      // Also save to localStorage for offline access
      localStorage.setItem('campy_tags', JSON.stringify(data || []));
    } catch (error) {
      console.error('Error loading tags:', error);
      // Fallback to localStorage
      const stored = localStorage.getItem('campy_tags');
      if (stored) {
        try {
          setTags(JSON.parse(stored));
        } catch (e) {
          setTags([]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (tagId) => {
    if (!confirm('Are you sure you want to delete this tag? It will be removed from all clients.')) {
      return;
    }

    setSaving(true);
    const updatedTags = tags.filter(t => t.id !== tagId);
    setTags(updatedTags);

    const client = getSupabaseClient();
    if (client) {
      try {
        const { error } = await client
          .from('tags')
          .delete()
          .eq('id', tagId);

        if (error) throw error;
        localStorage.setItem('campy_tags', JSON.stringify(updatedTags));
      } catch (error) {
        console.error('Error deleting tag:', error);
        // Revert on error
        setTags(tags);
      }
    } else {
      localStorage.setItem('campy_tags', JSON.stringify(updatedTags));
    }

    setSaving(false);
    if (onTagsUpdated) onTagsUpdated();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 className="modal-title">🏷️ Manage Tags</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Loading tags...
            </div>
          ) : (
            <div>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Available Tags</h4>
              {tags.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No tags available.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {tags.map(tag => (
                    <div
                      key={tag.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.875rem'
                      }}
                    >
                      <span className="tag" style={{ 
                        background: tag.color || '#a3e635',
                        color: 'black',
                        padding: '0.25rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: '600'
                      }}>
                        {tag.name}
                      </span>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteTag(tag.id)}
                        disabled={saving}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        title="Delete tag"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TagManagementModal;

