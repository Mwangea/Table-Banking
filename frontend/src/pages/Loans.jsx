import { useState, useEffect } from 'react';
import { api, exportUrl } from '../api';
import { formatDate } from '../utils/formatDate';
import AlertModal from '../components/AlertModal';

function filterLoans(list, search) {
  if (!search?.trim()) return list;
  const q = search.toLowerCase().trim();
  return list.filter(l => {
    const member = (l.member_name || '').toLowerCase();
    const amount = (l.loan_amount ?? 0).toString();
    const interest = (l.interest_amount ?? 0).toString();
    const total = (l.total_amount ?? 0).toString();
    const paid = (l.total_paid ?? 0).toString();
    const balance = (l.balance ?? 0).toString();
    const status = (l.status || '').toLowerCase();
    const dueDate = formatDate(l.due_date) || '';
    return member.includes(q) || amount.includes(q) || interest.includes(q) ||
      total.includes(q) || paid.includes(q) || balance.includes(q) || status.includes(q) || dueDate.includes(q);
  });
}

export default function Loans() {
  const [loans, setLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ member_id: '', loan_amount: '', interest_rate: '10', issue_date: '', due_date: '' });
  const [settings, setSettings] = useState({});
  const [availableCash, setAvailableCash] = useState(null);
  const [errorModal, setErrorModal] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  const load = () => {
    setLoading(true);
    Promise.all([
      api.loans.list().then(setLoans),
      api.members.list().then(setMembers),
      api.settings.get().then(setSettings)
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = filterLoans(loans, search);

  const openAdd = () => {
    const d = new Date();
    setForm({ member_id: '', loan_amount: '', interest_rate: settings.default_interest_rate || '10', issue_date: d.toISOString().slice(0, 10), due_date: '' });
    setModal(true);
    api.dashboard().then(d => setAvailableCash(d.availableCashInGroup ?? 0)).catch(() => setAvailableCash(null));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.loans.create(form);
      setModal(false);
      load();
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('Insufficient group funds') || msg.includes('Available cash')) {
        const match = msg.match(/Available cash:\s*([\d,.]+)/);
        const avail = match ? match[1] : '0';
        setErrorModal({
          title: 'Insufficient Group Funds',
          message: `Available cash: ${avail}. The group cannot lend more than what is in the pool.`,
          explanation: (
            <>
              <strong>Why is this?</strong><br />
              The pool = Total Contributions. Loans are funded from the pool (principal only). When members repay (principal + interest), money goes back in.<br /><br />
              <strong>Principal Lent</strong> = what you gave out (e.g. 3,000). <strong>Total Repaid</strong> = what came back (e.g. 3,300, including interest).<br /><br />
              <strong>Available Cash</strong> = Total Contributions − Outstanding Balance (what borrowers still owe). You can only lend what's in the pool right now.
            </>
          )
        });
      } else {
        setErrorModal({ title: 'Error', message: msg });
      }
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.loans.updateStatus(id, status);
      load();
    } catch (err) {
      setErrorModal({ title: 'Error', message: err.message });
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Loans</h1>
        <div className="page-actions">
          <a href={exportUrl('/export/loans')} className="btn btn-secondary" target="_blank" rel="noreferrer">Export</a>
          {isAdmin && <button type="button" className="btn btn-primary" onClick={openAdd}>Approve Loan</button>}
        </div>
      </div>

      <div className="card">
        <div className="form-group" style={{ marginBottom: '1rem', maxWidth: 320 }}>
          <label>Search</label>
          <input type="search" placeholder="Search member, amount, status, due date..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? (
          <div className="loading"><span className="loading-spinner" />Loading...</div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Loan Amount</th>
                    <th>Interest</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id}>
                      <td>{l.member_name}</td>
                      <td>{parseFloat(l.loan_amount).toLocaleString()}</td>
                      <td>{parseFloat(l.interest_amount).toLocaleString()}</td>
                      <td>{parseFloat(l.total_amount).toLocaleString()}</td>
                      <td>{parseFloat(l.total_paid || 0).toLocaleString()}</td>
                      <td>{parseFloat(l.balance || 0).toLocaleString()}</td>
                      <td><span className={`badge badge-${l.status?.toLowerCase()}`}>{l.status}</span></td>
                      <td>{formatDate(l.due_date)}</td>
                      {isAdmin && l.status !== 'Completed' && (
                        <td>
                          {l.status === 'Ongoing' && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => updateStatus(l.id, 'Defaulted')}>Mark Defaulted</button>
                          )}
                          {l.status === 'Defaulted' && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => updateStatus(l.id, 'Ongoing')}>Reinstate</button>
                          )}
                          {l.status === 'Pending' && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => updateStatus(l.id, 'Ongoing')}>Approve</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-cards">
              {filtered.map(l => (
                <div key={l.id} className="table-card">
                  <div className="table-card-row">
                    <label>Member</label>
                    <span>{l.member_name}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Amount</label>
                    <span>{parseFloat(l.loan_amount).toLocaleString()}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Balance</label>
                    <span>{parseFloat(l.balance || 0).toLocaleString()}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Due Date</label>
                    <span>{formatDate(l.due_date)}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Status</label>
                    <span className={`badge badge-${l.status?.toLowerCase()}`}>{l.status}</span>
                  </div>
                  {isAdmin && l.status !== 'Completed' && (
                    <div className="table-card-actions">
                      {l.status === 'Ongoing' && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => updateStatus(l.id, 'Defaulted')}>Mark Defaulted</button>
                      )}
                      {l.status === 'Defaulted' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => updateStatus(l.id, 'Ongoing')}>Reinstate</button>
                      )}
                      {l.status === 'Pending' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => updateStatus(l.id, 'Ongoing')}>Approve</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>New Loan</h3>
            {availableCash != null && (
              <div className="loan-available-info">
                Available cash in group: <strong>{parseFloat(availableCash).toLocaleString()}</strong>
                <span className="loan-available-hint">Loans are funded from contributions. Repayments go back to this pool.</span>
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Member</label>
                <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })} required>
                  <option value="">Select member</option>
                  {members.filter(m => m.status === 'Active').map(m => (
                    <option key={m.id} value={m.id}>{m.full_name} (Contrib: {parseFloat(m.total_contributions || 0).toLocaleString()})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Loan Amount</label>
                <input type="number" step="0.01" value={form.loan_amount} onChange={e => setForm({ ...form, loan_amount: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Interest Rate (%)</label>
                <input type="number" step="0.01" value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Issue Date</label>
                <input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} required />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">Create</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {errorModal && (
        <AlertModal
          title={errorModal.title}
          message={errorModal.message}
          explanation={errorModal.explanation}
          onClose={() => setErrorModal(null)}
        />
      )}
    </div>
  );
}
