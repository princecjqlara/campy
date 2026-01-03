import React from 'react';
import { getPackageInfo, formatPrice } from '../utils/clients';

const ViewClientModal = ({ client, onClose, onEdit, onViewCommunication }) => {
  if (!client) return null;

  const pkg = getPackageInfo(client);

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{client.clientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Business Name</div>
              <div style={{ fontWeight: '500' }}>{client.businessName || 'N/A'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Package</div>
              <div style={{ fontWeight: '500' }}>
                {pkg.emoji} {pkg.name} - {formatPrice(pkg.price)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Phase</div>
              <div style={{ fontWeight: '500', textTransform: 'capitalize' }}>{client.phase}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Payment Status</div>
              <div style={{ fontWeight: '500', textTransform: 'capitalize' }}>{client.paymentStatus}</div>
            </div>
            {client.assignedTo && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Assigned To</div>
                <div style={{ fontWeight: '500' }}>{client.assignedTo}</div>
              </div>
            )}
            {client.contactDetails && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Contact</div>
                <div style={{ fontWeight: '500' }}>{client.contactDetails}</div>
              </div>
            )}
            {client.remainingCredits !== undefined && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Remaining Credits</div>
                <div style={{ fontWeight: '500' }}>{client.remainingCredits}</div>
              </div>
            )}
          </div>
          {client.notes && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Notes</div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                {client.notes}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            {onViewCommunication && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  onClose();
                  onViewCommunication();
                }}
                style={{ marginRight: '0.5rem' }}
              >
                💬 Communication Log
              </button>
            )}
          </div>
          <div>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginRight: '0.5rem' }}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={onEdit}>
              Edit Client
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewClientModal;

