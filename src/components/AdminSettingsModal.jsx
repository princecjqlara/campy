import React, { useState, useEffect } from 'react';
import TagManagementModal from './TagManagementModal';

const AdminSettingsModal = ({ onClose, getExpenses, saveExpenses, getAIPrompts, saveAIPrompts, getPackagePrices, savePackagePrices, onTeamPerformance }) => {
  const [showTagManagement, setShowTagManagement] = useState(false);
  const [prices, setPrices] = useState({
    basic: 1799,
    star: 2999,
    fire: 3499,
    crown: 5799,
    custom: 0
  });
  const [expenses, setExpenses] = useState({
    basic: 500,
    star: 800,
    fire: 1000,
    crown: 1500,
    custom: 0
  });
  const [prompts, setPrompts] = useState({
    adType: '',
    campaignStructure: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const loadedPrices = await getPackagePrices();
        const loadedExpenses = await getExpenses();
        const loadedPrompts = await getAIPrompts();
        setPrices(loadedPrices);
        setExpenses(loadedExpenses);
        setPrompts(loadedPrompts);
      } catch (error) {
        console.error('Error loading settings:', error);
        setMessage({ type: 'error', text: 'Failed to load settings' });
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePriceChange = (packageType, value) => {
    setPrices(prev => ({
      ...prev,
      [packageType]: parseInt(value) || 0
    }));
  };

  const handleExpenseChange = (packageType, value) => {
    setExpenses(prev => ({
      ...prev,
      [packageType]: parseInt(value) || 0
    }));
  };

  const handlePromptChange = (promptType, value) => {
    setPrompts(prev => ({
      ...prev,
      [promptType]: value
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      await savePackagePrices(prices);
      await saveExpenses(expenses);
      await saveAIPrompts(prompts);
      setMessage({ type: 'success', text: 'Settings saved successfully! Page will reload in 1 second...' });
      // Reload the page to update package prices throughout the app
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay active" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">⚙️ Admin Settings</h3>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            <p>Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">⚙️ Admin Settings</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '2rem' }}>
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>💵 Package Prices (Revenue)</h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Set how much you earn per package per month
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Basic Package (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={prices.basic}
                  onChange={(e) => handlePriceChange('basic', e.target.value)}
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Star Package (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={prices.star}
                  onChange={(e) => handlePriceChange('star', e.target.value)}
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Fire Package (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={prices.fire}
                  onChange={(e) => handlePriceChange('fire', e.target.value)}
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Crown Package (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={prices.crown}
                  onChange={(e) => handlePriceChange('crown', e.target.value)}
                  min="0"
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Custom Package (₱)</label>
                <input
                  type="number"
                  className="form-input"
                  value={prices.custom}
                  onChange={(e) => handlePriceChange('custom', e.target.value)}
                  min="0"
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>💰 Package Expenses</h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Set your costs per package per month
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Basic Package</label>
                <input
                  type="number"
                  className="form-input"
                  value={expenses.basic}
                  onChange={(e) => handleExpenseChange('basic', e.target.value)}
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Star Package</label>
                <input
                  type="number"
                  className="form-input"
                  value={expenses.star}
                  onChange={(e) => handleExpenseChange('star', e.target.value)}
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Fire Package</label>
                <input
                  type="number"
                  className="form-input"
                  value={expenses.fire}
                  onChange={(e) => handleExpenseChange('fire', e.target.value)}
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Crown Package</label>
                <input
                  type="number"
                  className="form-input"
                  value={expenses.crown}
                  onChange={(e) => handleExpenseChange('crown', e.target.value)}
                  min="0"
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Custom Package</label>
                <input
                  type="number"
                  className="form-input"
                  value={expenses.custom}
                  onChange={(e) => handleExpenseChange('custom', e.target.value)}
                  min="0"
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🤖 AI Prompts</h4>
            <div className="form-group">
              <label className="form-label">Ad Type Prompt</label>
              <textarea
                className="form-input"
                rows="3"
                value={prompts.adType}
                onChange={(e) => handlePromptChange('adType', e.target.value)}
                placeholder="Analyze the business niche '{niche}' and target audience '{audience}'. Suggest the top 3 most effective Facebook ad formats."
                style={{ resize: 'vertical' }}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Use {'{niche}'} and {'{audience}'} as placeholders
              </small>
            </div>
            <div className="form-group">
              <label className="form-label">Campaign Structure Prompt</label>
              <textarea
                className="form-input"
                rows="3"
                value={prompts.campaignStructure}
                onChange={(e) => handlePromptChange('campaignStructure', e.target.value)}
                placeholder="For a local service business in niche '{niche}' with a budget of ₱150-300/day, outline a recommended campaign structure."
                style={{ resize: 'vertical' }}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Use {'{niche}'} and {'{audience}'} as placeholders
              </small>
            </div>
          </div>

          {message.text && (
            <div style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              borderRadius: '4px',
              backgroundColor: message.type === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: message.type === 'success' ? 'var(--success)' : 'var(--error)'
            }}>
              {message.text}
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={() => setShowTagManagement(true)}
              disabled={saving}
            >
              🏷️ Manage Tags
            </button>
            {onTeamPerformance && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  onClose();
                  onTeamPerformance();
                }}
                disabled={saving}
              >
                👥 View Team Performance
              </button>
            )}
          </div>
          <div>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving} style={{ marginRight: '0.5rem' }}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {showTagManagement && (
        <TagManagementModal
          isOpen={showTagManagement}
          onClose={() => setShowTagManagement(false)}
          onTagsUpdated={() => {
            // Tags updated, could trigger a refresh if needed
          }}
        />
      )}
    </div>
  );
};

export default AdminSettingsModal;
