import React, { useState, useEffect } from 'react';

const ClientModal = ({ clientId, client, onClose, onSave, onDelete }) => {
  const [activeTab, setActiveTab] = useState('basic');
  const [formData, setFormData] = useState({
    projectName: '',
    clientName: '',
    businessName: '',
    contactDetails: '',
    pageLink: '',
    assignedTo: '',
    adsExpense: 0,
    notes: '',
    tags: '',
    package: 'basic',
    customPackage: null,
    customPrice: 0,
    customVideos: 0,
    customMainVideos: 0,
    customPhotos: 0,
    customMeetingMins: 0,
    customCAPI: false,
    customAdvancedCAPI: false,
    customDailyAds: false,
    customUnlimitedSetup: false,
    customLookalike: false,
    customPriority: false,
    customFeatures: '',
    paymentStatus: 'unpaid',
    paymentSchedule: 'monthly',
    monthsWithClient: 0,
    startDate: '',
    phase: 'proposal-sent',
    autoSwitch: false,
    autoSwitchDays: 7,
    nextPhaseDate: '',
    subscriptionUsage: 0,
    testingRound: 1
  });

  useEffect(() => {
    if (client) {
      const customPkg = client.customPackage || {};
      setFormData({
        projectName: client.projectName || '',
        clientName: client.clientName || '',
        businessName: client.businessName || '',
        contactDetails: client.contactDetails || '',
        pageLink: client.pageLink || '',
        assignedTo: client.assignedTo || '',
        adsExpense: client.adsExpense || 0,
        notes: client.notes || '',
        tags: (client.tags || []).join(', '),
        package: client.package || 'basic',
        customPackage: client.customPackage || null,
        customPrice: customPkg.price || 0,
        customVideos: customPkg.videos || 0,
        customMainVideos: customPkg.mainVideos || 0,
        customPhotos: customPkg.photos || 0,
        customMeetingMins: customPkg.weeklyMeeting || 0,
        customCAPI: customPkg.capi || false,
        customAdvancedCAPI: customPkg.advancedCapi || false,
        customDailyAds: customPkg.dailyAds || false,
        customUnlimitedSetup: customPkg.unlimitedSetup || false,
        customLookalike: customPkg.lookalike || false,
        customPriority: customPkg.priority || false,
        customFeatures: customPkg.customFeatures || '',
        paymentStatus: client.paymentStatus || 'unpaid',
        paymentSchedule: client.paymentSchedule || 'monthly',
        monthsWithClient: client.monthsWithClient || 0,
        startDate: client.startDate || '',
        phase: client.phase || 'proposal-sent',
        autoSwitch: client.autoSwitch || false,
        autoSwitchDays: client.autoSwitchDays || 7,
        nextPhaseDate: client.nextPhaseDate || '',
        subscriptionUsage: client.subscriptionUsage || 0,
        testingRound: client.testingRound || 1
      });
    } else {
      // Reset form when creating new client
      setActiveTab('basic');
    }
  }, [client]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const tags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : [];
    
    // Build custom package if selected
    let customPackage = null;
    if (formData.package === 'custom') {
      customPackage = {
        price: formData.customPrice || 0,
        videos: formData.customVideos || 0,
        mainVideos: formData.customMainVideos || 0,
        photos: formData.customPhotos || 0,
        weeklyMeeting: formData.customMeetingMins || 0,
        capi: formData.customCAPI || false,
        advancedCapi: formData.customAdvancedCAPI || false,
        dailyAds: formData.customDailyAds || false,
        unlimitedSetup: formData.customUnlimitedSetup || false,
        lookalike: formData.customLookalike || false,
        priority: formData.customPriority || false,
        customFeatures: formData.customFeatures || ''
      };
    }

    onSave({
      projectName: formData.projectName,
      clientName: formData.clientName,
      businessName: formData.businessName,
      contactDetails: formData.contactDetails,
      pageLink: formData.pageLink,
      assignedTo: formData.assignedTo,
      adsExpense: formData.adsExpense || 0,
      notes: formData.notes,
      tags,
      package: formData.package,
      customPackage,
      paymentStatus: formData.paymentStatus,
      paymentSchedule: formData.paymentSchedule,
      monthsWithClient: formData.monthsWithClient || 0,
      startDate: formData.startDate,
      phase: formData.phase,
      autoSwitch: formData.autoSwitch || false,
      autoSwitchDays: formData.autoSwitchDays || 7,
      nextPhaseDate: formData.nextPhaseDate,
      subscriptionUsage: formData.subscriptionUsage || 0,
      testingRound: formData.testingRound || 1,
      subscriptionStarted: formData.phase === 'testing' || formData.phase === 'running'
    });
  };

  return (
    <div className="modal-overlay active" onClick={(e) => e.target.id === 'clientModal' && onClose()}>
      <div className="modal" id="clientModal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{clientId ? 'Edit Client' : 'Add New Client'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <form id="clientForm" onSubmit={handleSubmit}>
            <div className="tabs">
              <button type="button" className={`tab ${activeTab === 'basic' ? 'active' : ''}`} onClick={() => setActiveTab('basic')}>
                📝 Basic Info
              </button>
              <button type="button" className={`tab ${activeTab === 'package' ? 'active' : ''}`} onClick={() => setActiveTab('package')}>
                📦 Package
              </button>
              <button type="button" className={`tab ${activeTab === 'payment' ? 'active' : ''}`} onClick={() => setActiveTab('payment')}>
                💳 Payment
              </button>
              <button type="button" className={`tab ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
                Schedule
              </button>
            </div>

            {activeTab === 'basic' && (
              <div className={`tab-content ${activeTab === 'basic' ? 'active' : ''}`}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Project Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={formData.projectName}
                      onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Client Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={formData.clientName}
                      onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Business Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contact Details</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.contactDetails}
                      onChange={(e) => setFormData({ ...formData, contactDetails: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Page Link</label>
                  <input
                    type="url"
                    className="form-input"
                    value={formData.pageLink}
                    onChange={(e) => setFormData({ ...formData, pageLink: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Assigned To</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.assignedTo}
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                    placeholder="Who is handling this client?"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-textarea"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes about the client..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tags</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="Enter tags separated by commas (e.g., VIP, New, Priority)"
                  />
                </div>
              </div>
            )}

            {activeTab === 'package' && (
              <div className={`tab-content ${activeTab === 'package' ? 'active' : ''}`}>
                <div className="form-group">
                  <label className="form-label">Select Package *</label>
                  <div className="package-selector">
                    {['basic', 'star', 'fire', 'crown', 'custom'].map(pkg => {
                      const packages = {
                        basic: { emoji: '🟢', price: '₱1,799', name: 'Basic' },
                        star: { emoji: '⭐', price: '₱2,999', name: 'Star' },
                        fire: { emoji: '🔥', price: '₱3,499', name: 'Fire' },
                        crown: { emoji: '👑', price: '₱5,799', name: 'Crown' },
                        custom: { emoji: '🎨', price: 'Custom', name: 'Custom' }
                      };
                      const pkgInfo = packages[pkg];
                      return (
                        <label
                          key={pkg}
                          className={`package-option ${formData.package === pkg ? 'selected' : ''}`}
                          onClick={() => setFormData({ ...formData, package: pkg })}
                        >
                          <input
                            type="radio"
                            name="package"
                            value={pkg}
                            checked={formData.package === pkg}
                            onChange={() => setFormData({ ...formData, package: pkg })}
                          />
                          <div className="package-emoji">{pkgInfo.emoji}</div>
                          <div className="package-price">{pkgInfo.price}</div>
                          <div className="package-name">{pkgInfo.name}</div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {formData.package === 'custom' && (
                  <div className="custom-package-fields" style={{ marginTop: 'var(--space-lg)' }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Custom Price (₱)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customPrice || ''}
                          onChange={(e) => setFormData({ ...formData, customPrice: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">15-sec Videos</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customVideos || ''}
                          onChange={(e) => setFormData({ ...formData, customVideos: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Main Videos</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customMainVideos || ''}
                          onChange={(e) => setFormData({ ...formData, customMainVideos: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                          min="0"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Photos</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customPhotos || ''}
                          onChange={(e) => setFormData({ ...formData, customPhotos: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Weekly 1-on-1 (mins)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.customMeetingMins || ''}
                          onChange={(e) => setFormData({ ...formData, customMeetingMins: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customCAPI || false}
                          onChange={(e) => setFormData({ ...formData, customCAPI: e.target.checked })}
                        /> CAPI
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customAdvancedCAPI || false}
                          onChange={(e) => setFormData({ ...formData, customAdvancedCAPI: e.target.checked })}
                        /> Advanced CAPI
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customDailyAds || false}
                          onChange={(e) => setFormData({ ...formData, customDailyAds: e.target.checked })}
                        /> Daily Ads Monitoring
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customUnlimitedSetup || false}
                          onChange={(e) => setFormData({ ...formData, customUnlimitedSetup: e.target.checked })}
                        /> Unlimited Ad Setup
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customLookalike || false}
                          onChange={(e) => setFormData({ ...formData, customLookalike: e.target.checked })}
                        /> Lookalike Audiences
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={formData.customPriority || false}
                          onChange={(e) => setFormData({ ...formData, customPriority: e.target.checked })}
                        /> Priority Handling
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Custom Features</label>
                      <textarea
                        className="form-textarea"
                        value={formData.customFeatures || ''}
                        onChange={(e) => setFormData({ ...formData, customFeatures: e.target.value })}
                        placeholder="List any additional custom features..."
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'payment' && (
              <div className={`tab-content ${activeTab === 'payment' ? 'active' : ''}`}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Payment Status</label>
                    <select
                      className="form-select"
                      value={formData.paymentStatus}
                      onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                      <option value="partial">Partial Payment</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Payment Schedule</label>
                    <select
                      className="form-select"
                      value={formData.paymentSchedule}
                      onChange={(e) => setFormData({ ...formData, paymentSchedule: e.target.value })}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="biweekly">Bi-Weekly</option>
                      <option value="onetime">One-Time</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Months with Client</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.monthsWithClient}
                      onChange={(e) => setFormData({ ...formData, monthsWithClient: parseInt(e.target.value) || 0 })}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'schedule' && (
              <div className={`tab-content ${activeTab === 'schedule' ? 'active' : ''}`}>
                <div className="form-group">
                  <label className="form-label">Current Phase</label>
                    <select
                      className="form-select"
                      value={formData.phase}
                      onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
                    >
                      <option value="proposal-sent">📧 Proposal Sent</option>
                      <option value="booked">📅 Booked Meeting</option>
                      <option value="preparing">Preparing</option>
                      <option value="testing">Testing</option>
                      <option value="running">Running</option>
                    </select>
                </div>

                <div className="form-group">
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.autoSwitch}
                      onChange={(e) => setFormData({ ...formData, autoSwitch: e.target.checked })}
                    /> Enable Auto Phase Switch
                  </label>
                </div>

                {formData.autoSwitch && (
                  <div className="auto-switch-fields">
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Days until next phase</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.autoSwitchDays}
                          onChange={(e) => setFormData({ ...formData, autoSwitchDays: parseInt(e.target.value) || 7 })}
                          min="1"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Next Phase Date</label>
                        <input
                          type="date"
                          className="form-input"
                          value={formData.nextPhaseDate}
                          onChange={(e) => setFormData({ ...formData, nextPhaseDate: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formData.phase === 'testing' && (
                  <div className="testing-options">
                    <h4 style={{ margin: 'var(--space-lg) 0 var(--space-md)', color: 'var(--phase-testing)' }}>
                      Testing Phase Settings
                    </h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Subscription Usage (%)</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.subscriptionUsage}
                          onChange={(e) => setFormData({ ...formData, subscriptionUsage: parseInt(e.target.value) || 0 })}
                          min="0"
                          max="100"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Testing Round</label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.testingRound}
                          onChange={(e) => setFormData({ ...formData, testingRound: parseInt(e.target.value) || 1 })}
                          min="1"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            subscriptionUsage: 0,
                            testingRound: (formData.testingRound || 1) + 1
                          });
                        }}
                      >
                        🔄 Start New Testing Round
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {clientId && (
            <button type="button" className="btn btn-danger" onClick={() => onDelete(clientId)}>Delete Client</button>
          )}
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>Save Client</button>
        </div>
      </div>
    </div>
  );
};

export default ClientModal;

