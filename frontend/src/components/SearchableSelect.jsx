import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ value, onChange, options, placeholder = 'Select...', required, disabled }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));
  const displayLabel = selected ? selected.label : '';

  const filtered = options.filter(o =>
    (o.label || '').toLowerCase().includes((search || '').toLowerCase().trim())
  );

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  useEffect(() => {
    const fn = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
  }, []);

  const handleSelect = (opt) => {
    onChange(opt.value);
    setOpen(false);
  };

  return (
    <div className="searchable-select" ref={containerRef}>
      <button
        type="button"
        className="searchable-select-trigger"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.6rem 0.875rem',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: displayLabel ? 'var(--text-primary)' : 'var(--text-muted)',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        <span className="searchable-select-value">{displayLabel || placeholder}</span>
        <span className="searchable-select-arrow" style={{ opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="searchable-select-dropdown">
          <div className="searchable-select-search">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              autoFocus
              className="searchable-select-input"
            />
          </div>
          <div className="searchable-select-list">
            {filtered.length === 0 ? (
              <div className="searchable-select-empty">No matches</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`searchable-select-option ${String(opt.value) === String(value) ? 'selected' : ''}`}
                  onClick={() => handleSelect(opt)}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
