import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api, exportUrl } from '../api';
import { formatDate } from '../utils/formatDate';
import AlertModal from '../components/AlertModal';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';
import DeleteModal from '../components/DeleteModal';

const CACHE_KEY = 'table_banking_loans';
const PAGE_SIZE = 10;

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
  const [loans, setLoans] = useState(() => {
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
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ member_id: '', loan_amount: '', interest_rate: '10', issue_date: '', due_date: '' });
  const [settings, setSettings] = useState({});
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [availableCash, setAvailableCash] = useState(null);
  const [errorModal, setErrorModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  const load = () => {
    setLoading(true);
    Promise.all([
      api.loans.list().then(data => {
        setLoans(data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      }),
      api.members.list().then(data => {
        setMembers(data);
        try { localStorage.setItem('table_banking_members', JSON.stringify(data)); } catch {}
      }),
      api.settings.get().then(setSettings)
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = filterLoans(loans, search);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search]);

  const openAdd = () => {
    const d = new Date();
    setForm({ member_id: '', loan_amount: '', interest_rate: '10', issue_date: d.toISOString().slice(0, 10), due_date: '' });
    setModal('add');
    api.dashboard().then(d => setAvailableCash(d.availableCashInGroup ?? 0)).catch(() => setAvailableCash(null));
  };

  const openEdit = (l) => {
    setForm({
      id: l.id,
      member_id: l.member_id,
      loan_amount: l.loan_amount,
      interest_rate: '10',
      issue_date: (l.issue_date || '').toString().slice(0, 10),
      due_date: (l.due_date || '').toString().slice(0, 10)
    });
    setModal('edit');
    setAvailableCash(null);
  };

  const openDelete = (l) => setDeleteTarget(l);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await api.loans.update(form.id, { member_id: form.member_id, loan_amount: form.loan_amount, interest_rate: form.interest_rate, issue_date: form.issue_date, due_date: form.due_date });
      } else {
        await api.loans.create(form);
      }
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
    } finally {
      setSaving(false);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.loans.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
      toast.success('Loan deleted.');
    } catch (err) {
      setErrorModal({ title: 'Error', message: err.message });
    } finally {
      setDeleting(false);
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
                  {paginated.map(l => (
                    <tr key={l.id}>
                      <td>{l.member_name}</td>
                      <td>{parseFloat(l.loan_amount).toLocaleString()}</td>
                      <td>{parseFloat(l.interest_amount).toLocaleString()}</td>
                      <td>{parseFloat(l.total_amount).toLocaleString()}</td>
                      <td>{parseFloat(l.total_paid || 0).toLocaleString()}</td>
                      <td>{parseFloat(l.balance || 0).toLocaleString()}</td>
                      <td><span className={`badge badge-${l.status?.toLowerCase()}`}>{l.status}</span></td>
                      <td>{formatDate(l.due_date)}</td>
                      {isAdmin && (
                        <td>
                          {l.status !== 'Completed' && (
                            <>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(l)}>Edit</button>
                              {l.status === 'Ongoing' && (
                                <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => updateStatus(l.id, 'Defaulted')}>Mark Defaulted</button>
                              )}
                              {l.status === 'Defaulted' && (
                                <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => updateStatus(l.id, 'Ongoing')}>Reinstate</button>
                              )}
                              {l.status === 'Pending' && (
                                <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => updateStatus(l.id, 'Ongoing')}>Approve</button>
                              )}
                            </>
                          )}
                          {l.status === 'Completed' && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(l)}>Edit</button>
                          )}
                          <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => openDelete(l)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            <div className="table-cards">
              {paginated.map(l => (
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
                  {isAdmin && (
                    <div className="table-card-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(l)}>Edit</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => openDelete(l)}>Delete</button>
                      {l.status !== 'Completed' && (
                        <>
                          {l.status === 'Ongoing' && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => updateStatus(l.id, 'Defaulted')}>Mark Defaulted</button>
                          )}
                          {l.status === 'Defaulted' && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => updateStatus(l.id, 'Ongoing')}>Reinstate</button>
                          )}
                          {l.status === 'Pending' && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => updateStatus(l.id, 'Ongoing')}>Approve</button>
                          )}
                        </>
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
            <h3>{modal === 'edit' ? 'Edit Loan' : 'New Loan'}</h3>
            {availableCash != null && modal === 'add' && (
              <div className="loan-available-info">
                Available cash in group: <strong>{parseFloat(availableCash).toLocaleString()}</strong>
                <span className="loan-available-hint">Loans are funded from contributions. Repayments go back to this pool.</span>
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Member</label>
                <SearchableSelect
                  value={form.member_id}
                  onChange={val => setForm({ ...form, member_id: val })}
                  options={members.filter(m => m.status === 'Active' || m.id == form.member_id).map(m => ({
                    value: m.id,
                    label: `${m.full_name} (Contrib: ${parseFloat(m.total_contributions || 0).toLocaleString()})`
                  }))}
                  placeholder="Select member"
                  required
                />
              </div>
              <div className="form-group">
                <label>Loan Amount</label>
                <input type="number" step="0.01" value={form.loan_amount} onChange={e => setForm({ ...form, loan_amount: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Interest Rate (%)</label>
                <input type="number" value="10" readOnly disabled />
                <span className="form-hint">10% per annum on reducing balance</span>
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
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving && <span className="loading-spinner" />}{saving ? (form.id ? 'Saving...' : 'Creating...') : (form.id ? 'Save' : 'Create')}
                </button>
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

      {deleteTarget && (
        <DeleteModal
          title="Delete Loan"
          message={`Are you sure you want to delete the loan of ${parseFloat(deleteTarget.loan_amount).toLocaleString()} for ${deleteTarget.member_name}? This will also remove all repayment records for this loan.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
