import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api, exportUrl } from '../api';
import { formatDate } from '../utils/formatDate';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';

const CACHE_KEY = 'table_banking_repayments';
const PAGE_SIZE = 10;

function filterRepayments(list, search) {
  if (!search?.trim()) return list;
  const q = search.toLowerCase().trim();
  return list.filter(r => {
    const member = (r.member_name || '').toLowerCase();
    const loanId = (r.loan_id || '').toString();
    const amount = (r.amount_paid ?? 0).toString();
    const date = formatDate(r.payment_date) || '';
    return member.includes(q) || loanId.includes(q) || amount.includes(q) || date.includes(q);
  });
}

export default function Repayments() {
  const [repayments, setRepayments] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loans, setLoans] = useState(() => {
    try {
      const cached = localStorage.getItem('table_banking_loans');
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ loan_id: '', amount_paid: '', payment_date: '' });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.repayments.list().then(data => {
        setRepayments(data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      }),
      api.loans.list().then(data => {
        setLoans(data);
        try { localStorage.setItem('table_banking_loans', JSON.stringify(data)); } catch {}
      })
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = filterRepayments(repayments, search);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search]);

  const openAdd = () => {
    const d = new Date();
    setForm({ loan_id: '', amount_paid: '', payment_date: d.toISOString().slice(0, 10) });
    setModal(true);
    api.loans.list().then(setLoans);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.repayments.create(form);
      setModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const repayableLoans = loans.filter(l => {
    const status = (l.status || '').toLowerCase();
    const balance = parseFloat(l.balance ?? l.total_amount - (l.total_paid || 0) ?? 0);
    return (status === 'ongoing' || status === 'defaulted') && balance > 0;
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Repayments</h1>
        <div className="page-actions">
          <a href={exportUrl('/export/repayments')} className="btn btn-secondary" target="_blank" rel="noreferrer">Export</a>
          <button type="button" className="btn btn-primary" onClick={openAdd}>Record Repayment</button>
        </div>
      </div>

      <div className="card">
        <div className="form-group" style={{ marginBottom: '1rem', maxWidth: 320 }}>
          <label>Search</label>
          <input type="search" placeholder="Search member, loan ID, amount, date..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? (
          <div className="loading"><span className="loading-spinner" />Loading...</div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Member</th>
                    <th>Loan ID</th>
                    <th>Amount Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(r => (
                    <tr key={r.id}>
                      <td>{formatDate(r.payment_date)}</td>
                      <td>{r.member_name}</td>
                      <td>{r.loan_id}</td>
                      <td>{parseFloat(r.amount_paid).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            <div className="table-cards">
              {paginated.map(r => (
                <div key={r.id} className="table-card">
                  <div className="table-card-row">
                    <label>Member</label>
                    <span>{r.member_name}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Date</label>
                    <span>{formatDate(r.payment_date)}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Amount</label>
                    <span>{parseFloat(r.amount_paid).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Record Repayment</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Loan</label>
                <SearchableSelect
                  value={form.loan_id}
                  onChange={val => setForm({ ...form, loan_id: val })}
                  options={repayableLoans.map(l => ({
                    value: l.id,
                    label: `#${l.id} - ${l.member_name} - Balance: ${parseFloat(l.balance ?? 0).toLocaleString()}`
                  }))}
                  placeholder="Select loan"
                  required
                  disabled={repayableLoans.length === 0}
                />
                {repayableLoans.length === 0 && (
                  <p className="no-loans-msg">No loans with outstanding balance. Approve a loan first from the Loans page.</p>
                )}
              </div>
              <div className="form-group">
                <label>Amount Paid</label>
                <input type="number" step="0.01" value={form.amount_paid} onChange={e => setForm({ ...form, amount_paid: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Payment Date</label>
                <input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} required />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={repayableLoans.length === 0 || saving}>
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
