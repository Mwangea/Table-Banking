export default function DeleteModal({ title, message, onConfirm, onCancel, loading }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-delete" onClick={e => e.stopPropagation()}>
        <h3>{title || 'Confirm Delete'}</h3>
        <p className="delete-message">{message || 'Are you sure you want to delete this item? This action cannot be undone.'}</p>
        <div className="form-actions">
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
