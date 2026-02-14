import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api';
import { formatDate } from '../utils/formatDate';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';

const CACHE_KEY = 'table_banking_fines';
const PAGE_SIZE = 10;

function filterList(list, search) {
  if (!search?.trim()) return list;
  const q = search.toLowerCase().trim();
  return list.filter(r => {
    const member = (r.member_name || '').toLowerCase();
    const reason = (r.reason || '').toLowerCase();
    const amount = (r.amount ?? 0).toString();
    const status = (r.status || '').toLowerCase();
    const date = formatDate(r.issued_date) || '';
    return member.includes(q) || reason.includes(q) || amount.includes(q) || status.includes(q) || date.includes(q);
  });
}

export default function Fines() {
  const [list, setList] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [members, setMembers] = useState(() => {
    try {
      const cached = localStorage.getItem('table_banking_members');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [settings, setSettings] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [form, setForm] = useState({ member_id: '', amount: '', reason: '', issued_date: '' });

  const load = () => {
    setLoading(true);
    const params = statusFilter ? { status: statusFilter } : null;
    Promise.all([
      api.fines.list(params).then(data => {
        setList(data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      }),
      api.members.list().then(data => {
        setMembers(data);
        try { localStorage.setItem('table_banking_members', JSON.stringify(data)); } catch {}
      }),
      api.settings.get().then(setSettings)
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [statusFilter]);

  const filtered = filterList(list, search);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusFilter]);
  const defaultFine = parseFloat(settings.default_fine_amount || 100);
  const unpaidTotal = list.filter(f => f.status === 'Unpaid').reduce((s, f) => s + parseFloat(f.amount || 0), 0);
  const paidTotal = list.filter(f => f.status === 'Paid').reduce((s, f) => s + parseFloat(f.amount || 0), 0);

  const openAdd = () => {
    const d = new Date();
    setForm({ member_id: '', amount: defaultFine, reason: '', issued_date: d.toISOString().slice(0, 10) });
    setModal(true);
  };

  const openPay = (fine) => {
    setPayModal(fine);
    setPaymentDate(new Date().toISOString().slice(0, 10));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.fines.create(form);
      setModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!payModal) return;
    setPaying(true);
    try {
      const res = await api.fines.pay(payModal.id, { payment_date: paymentDate });
      const amount = res?.addedToPool ?? parseFloat(payModal.amount || 0);
      setPayModal(null);
      load();
      toast.success(`${amount.toLocaleString()} has been added to the group pool.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Fines</h1>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={openAdd}>Issue Fine</button>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 280 }}>
            <label>Search</label>
            <input type="search" placeholder="Search member, reason, amount..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 160 }}>
            <label>Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>
          <strong>Unpaid:</strong> {unpaidTotal.toLocaleString()} &nbsp;|&nbsp; <strong>Paid (to pool):</strong> {paidTotal.toLocaleString()}
        </div>
        {loading ? (
          <div className="loading"><span className="loading-spinner" />Loading...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(r => (
                  <tr key={r.id}>
                    <td>{formatDate(r.issued_date)}</td>
                    <td>{r.member_name}</td>
                    <td>{parseFloat(r.amount).toLocaleString()}</td>
                    <td>{r.reason || '-'}</td>
                    <td><span className={`badge badge-${r.status?.toLowerCase()}`}>{r.status}</span></td>
                    <td>
                      {r.status === 'Unpaid' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => openPay(r)}>Mark Paid</button>
                      )}
                    </td>
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
            <h3>Issue Fine</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Member</label>
                <SearchableSelect
                  value={form.member_id}
                  onChange={val => setForm({ ...form, member_id: val })}
                  options={members.filter(m => m.status === 'Active').map(m => ({ value: m.id, label: m.full_name }))}
                  placeholder="Select member"
                  required
                />
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Reason (optional)</label>
                <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Late repayment" />
              </div>
              <div className="form-group">
                <label>Issued Date</label>
                <input type="date" value={form.issued_date} onChange={e => setForm({ ...form, issued_date: e.target.value })} required />
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

      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Mark Fine as Paid</h3>
            <p>Member: {payModal.member_name} | Amount: {parseFloat(payModal.amount).toLocaleString()}</p>
            <form onSubmit={handlePay}>
              <div className="form-group">
                <label>Payment Date</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={paying}>
                  {paying && <span className="loading-spinner" />}{paying ? 'Confirming...' : 'Confirm Payment'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setPayModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
