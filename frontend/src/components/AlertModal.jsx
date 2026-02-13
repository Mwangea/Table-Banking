export default function AlertModal({ title, message, explanation, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content alert-modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="alert-modal-message">{message}</p>
        {explanation && (
          <div className="alert-modal-explanation">
            {explanation}
          </div>
        )}
        <div className="form-actions" style={{ marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
