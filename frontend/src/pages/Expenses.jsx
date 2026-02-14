import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api';
import { formatDate } from '../utils/formatDate';
import Pagination from '../components/Pagination';

const CACHE_KEY = 'table_banking_expenses';
const PAGE_SIZE = 10;

function filterList(list, search) {
  if (!search?.trim()) return list;
  const q = search.toLowerCase().trim();
  return list.filter(r => {
    const cat = (r.category || '').toLowerCase();
    const desc = (r.description || '').toLowerCase();
    const amount = (r.amount ?? 0).toString();
    const date = formatDate(r.expense_date) || '';
    return cat.includes(q) || desc.includes(q) || amount.includes(q) || date.includes(q);
  });
}

export default function Expenses() {
  const [list, setList] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: '', expense_date: '', category: '', description: '' });

  const load = () => {
    setLoading(true);
    api.expenses.list().then(data => {
      setList(data);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = filterList(list, search);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search]);

  const openAdd = () => {
    const d = new Date();
    setForm({ amount: '', expense_date: d.toISOString().slice(0, 10), category: '', description: '' });
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.expenses.create(form);
      setModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const total = list.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Expenses</h1>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={openAdd}>Record Expense</button>
        </div>
      </div>

      <div className="card">
        <div className="form-group" style={{ marginBottom: '1rem', maxWidth: 320 }}>
          <label>Search</label>
          <input type="search" placeholder="Search category, description, amount, date..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 600 }}>Total Expenses: {total.toLocaleString()}</div>
        {loading ? (
          <div className="loading"><span className="loading-spinner" />Loading...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(r => (
                  <tr key={r.id}>
                    <td>{formatDate(r.expense_date)}</td>
                    <td>{r.category || '-'}</td>
                    <td>{parseFloat(r.amount).toLocaleString()}</td>
                    <td>{r.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Record Expense</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Amount</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Category (optional)</label>
                <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Office supplies" />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Details..." />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving && <span className="loading-spinner" />}{saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
