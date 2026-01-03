import React from 'react';

const ViewClientModal = ({ client, onClose, onEdit }) => {
  if (!client) return null;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{client.clientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p>Client details will be displayed here</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={onEdit}>Edit Client</button>
        </div>
      </div>
    </div>
  );
};

export default ViewClientModal;

