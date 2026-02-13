import { useState, useEffect } from 'react';
import { api } from '../api';
import { formatDate } from '../utils/formatDate';
import DeleteModal from '../components/DeleteModal';

const SOURCES = ['Financial Aid', 'Government Loan', 'Other'];

const TABS = [
  { id: 'external', label: 'External Funds' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'regfees', label: 'Reg. Fees' },
  { id: 'fines', label: 'Fines' }
];

function filterList(list, search, tab) {
  if (!search?.trim()) return list;
  const q = search.toLowerCase().trim();
  return list.filter(r => {
    const str = [
      r.source, r.member_name, r.category, r.reason, r.description,
      (r.amount ?? 0).toString(), formatDate(r.received_date || r.expense_date || r.payment_date || r.issued_date),
      (r.status || '').toLowerCase()
    ].filter(Boolean).join(' ').toLowerCase();
    return str.includes(q);
  });
}

export default function Transactions() {
  const [tab, setTab] = useState('external');
  const [externalList, setExternalList] = useState([]);
  const [expensesList, setExpensesList] = useState([]);
  const [regFeesList, setRegFeesList] = useState([]);
  const [finesList, setFinesList] = useState([]);
  const [members, setMembers] = useState([]);
  const [settings, setSettings] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [form, setForm] = useState({});

  const load = () => {
    setLoading(true);
    const params = tab === 'fines' && statusFilter ? { status: statusFilter } : null;
    Promise.all([
      api.externalFunds.list().then(setExternalList),
      api.expenses.list().then(setExpensesList),
      api.registrationFees.list().then(setRegFeesList),
      api.fines.list(params).then(setFinesList),
      api.members.list().then(setMembers),
      api.settings.get().then(setSettings)
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [tab, statusFilter]);

  const regFeeAmount = parseFloat(settings.registration_fee_amount || 500);
  const defaultFine = parseFloat(settings.default_fine_amount || 100);
  const paidMemberIds = new Set(regFeesList.map(r => r.member_id));

  const getList = () => {
    if (tab === 'external') return filterList(externalList, search, tab);
    if (tab === 'expenses') return filterList(expensesList, search, tab);
    if (tab === 'regfees') return filterList(regFeesList, search, tab);
    return filterList(finesList, search, tab);
  };
  const filtered = getList();

  const getTotal = () => {
    if (tab === 'external') return externalList.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    if (tab === 'expenses') return expensesList.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    if (tab === 'regfees') return regFeesList.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const paid = finesList.filter(f => f.status === 'Paid').reduce((s, f) => s + parseFloat(f.amount || 0), 0);
    const unpaid = finesList.filter(f => f.status === 'Unpaid').reduce((s, f) => s + parseFloat(f.amount || 0), 0);
    return { paid, unpaid };
  };
  const total = getTotal();

  const openAdd = () => {
    const d = new Date();
    if (tab === 'external') {
      setForm({ source: 'Financial Aid', amount: '', received_date: d.toISOString().slice(0, 10), description: '' });
      setModal('external');
    } else if (tab === 'expenses') {
      setForm({ amount: '', expense_date: d.toISOString().slice(0, 10), category: '', description: '' });
      setModal('expenses');
    } else if (tab === 'regfees') {
      setForm({ member_id: paidMemberIds.size ? '' : (members.find(m => m.status === 'Active')?.id || ''), amount: regFeeAmount, payment_date: d.toISOString().slice(0, 10) });
      setModal('regfees');
    } else {
      setForm({ member_id: '', amount: defaultFine, reason: '', issued_date: d.toISOString().slice(0, 10) });
      setModal('fines');
    }
  };

  const openEdit = (row) => {
    if (tab === 'external') {
      setForm({ id: row.id, source: row.source, amount: row.amount, received_date: (row.received_date || '').slice(0, 10), description: row.description || '' });
      setModal('external');
    } else if (tab === 'expenses') {
      setForm({ id: row.id, amount: row.amount, expense_date: (row.expense_date || '').slice(0, 10), category: row.category || '', description: row.description || '' });
      setModal('expenses');
    } else if (tab === 'regfees') {
      setForm({ id: row.id, member_id: row.member_id, amount: row.amount, payment_date: (row.payment_date || '').slice(0, 10) });
      setModal('regfees');
    } else {
      setForm({ id: row.id, member_id: row.member_id, amount: row.amount, reason: row.reason || '', issued_date: (row.issued_date || '').slice(0, 10) });
      setModal('fines');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const isEdit = !!form.id;
      if (modal === 'external') {
        if (isEdit) await api.externalFunds.update(form.id, { source: form.source, amount: form.amount, received_date: form.received_date, description: form.description });
        else await api.externalFunds.create(form);
      } else if (modal === 'expenses') {
        if (isEdit) await api.expenses.update(form.id, { amount: form.amount, expense_date: form.expense_date, category: form.category, description: form.description });
        else await api.expenses.create(form);
      } else if (modal === 'regfees') {
        if (isEdit) await api.registrationFees.update(form.id, { member_id: form.member_id, amount: form.amount, payment_date: form.payment_date });
        else await api.registrationFees.create(form);
      } else {
        if (isEdit) await api.fines.update(form.id, { member_id: form.member_id, amount: form.amount, reason: form.reason, issued_date: form.issued_date });
        else await api.fines.create(form);
      }
      setModal(null);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (tab === 'external') await api.externalFunds.delete(deleteTarget.id);
      else if (tab === 'expenses') await api.expenses.delete(deleteTarget.id);
      else if (tab === 'regfees') await api.registrationFees.delete(deleteTarget.id);
      else await api.fines.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const openPay = (fine) => {
    setPayModal(fine);
    setPaymentDate(new Date().toISOString().slice(0, 10));
  };
  const handlePay = async (e) => {
    e.preventDefault();
    if (!payModal) return;
    try {
      await api.fines.pay(payModal.id, { payment_date: paymentDate });
      setPayModal(null);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
      </div>

      <div className="card">
        <div className="tabs-row">
          {TABS.map(t => (
            <button key={t.id} type="button" className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 280 }}>
            <label>Search</label>
            <input type="search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {tab === 'fines' && (
            <div className="form-group" style={{ marginBottom: 0, maxWidth: 140 }}>
              <label>Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
          )}
          <button type="button" className="btn btn-primary" onClick={openAdd} style={{ marginTop: '1.5rem' }}>
            {tab === 'external' && 'Add External Fund'}
            {tab === 'expenses' && 'Record Expense'}
            {tab === 'regfees' && 'Record Reg. Fee'}
            {tab === 'fines' && 'Issue Fine'}
          </button>
        </div>

        <div style={{ marginTop: '1rem', fontSize: '0.95rem', fontWeight: 600 }}>
          {tab === 'fines' ? (
            <>Unpaid: {(total.unpaid || 0).toLocaleString()} | Paid: {(total.paid || 0).toLocaleString()}</>
          ) : (
            <>Total: {(typeof total === 'number' ? total : total.paid || 0).toLocaleString()}</>
          )}
        </div>

        {loading ? (
          <div className="loading" style={{ marginTop: '1.5rem' }}><span className="loading-spinner" />Loading...</div>
        ) : (
          <div className="table-wrapper" style={{ marginTop: '1rem' }}>
            {tab === 'external' && (
              <table>
                <thead><tr><th>Date</th><th>Source</th><th>Amount</th><th>Description</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td>{formatDate(r.received_date)}</td><td>{r.source}</td><td>{parseFloat(r.amount).toLocaleString()}</td><td>{r.description || '-'}</td>
                      <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button><button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => setDeleteTarget(r)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'expenses' && (
              <table>
                <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Description</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td>{formatDate(r.expense_date)}</td><td>{r.category || '-'}</td><td>{parseFloat(r.amount).toLocaleString()}</td><td>{r.description || '-'}</td>
                      <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button><button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => setDeleteTarget(r)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'regfees' && (
              <table>
                <thead><tr><th>Date</th><th>Member</th><th>Amount</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td>{formatDate(r.payment_date)}</td><td>{r.member_name}</td><td>{parseFloat(r.amount).toLocaleString()}</td>
                      <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button><button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => setDeleteTarget(r)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'fines' && (
              <table>
                <thead><tr><th>Date</th><th>Member</th><th>Amount</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td>{formatDate(r.issued_date)}</td>
                      <td>{r.member_name}</td>
                      <td>{parseFloat(r.amount).toLocaleString()}</td>
                      <td>{r.reason || '-'}</td>
                      <td><span className={`badge badge-${r.status?.toLowerCase()}`}>{r.status}</span></td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                        {r.status === 'Unpaid' && <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => openPay(r)}>Mark Paid</button>}
                        <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => setDeleteTarget(r)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {modal === 'external' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{form.id ? 'Edit' : 'Add'} External Fund</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Source</label><select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="form-group"><label>Amount</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
              <div className="form-group"><label>Received Date</label><input type="date" value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })} required /></div>
              <div className="form-group"><label>Description (optional)</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="form-actions"><button type="submit" className="btn btn-primary">Save</button><button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === 'expenses' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{form.id ? 'Edit' : 'Record'} Expense</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group"><label>Amount</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
              <div className="form-group"><label>Date</label><input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} required /></div>
              <div className="form-group"><label>Category (optional)</label><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
              <div className="form-group"><label>Description (optional)</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="form-actions"><button type="submit" className="btn btn-primary">Save</button><button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === 'regfees' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{form.id ? 'Edit' : 'Record'} Registration Fee</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Member</label>
                <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })} required>
                  <option value="">Select member</option>
                  {members.filter(m => m.status === 'Active').map(m => (
                    <option key={m.id} value={m.id}>{m.full_name}{paidMemberIds.has(m.id) ? ' (paid)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group"><label>Amount</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
              <div className="form-group"><label>Payment Date</label><input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} required /></div>
              <div className="form-actions"><button type="submit" className="btn btn-primary">Save</button><button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}

      {modal === 'fines' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{form.id ? 'Edit' : 'Issue'} Fine</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Member</label>
                <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })} required>
                  <option value="">Select member</option>
                  {members.filter(m => m.status === 'Active').map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Amount</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
              <div className="form-group"><label>Reason (optional)</label><input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
              <div className="form-group"><label>Issued Date</label><input type="date" value={form.issued_date} onChange={e => setForm({ ...form, issued_date: e.target.value })} required /></div>
              <div className="form-actions"><button type="submit" className="btn btn-primary">Save</button><button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteModal
          title="Delete Transaction"
          message={`Are you sure you want to delete this ${tab === 'external' ? 'external fund' : tab === 'expenses' ? 'expense' : tab === 'regfees' ? 'registration fee' : 'fine'}?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Mark Fine as Paid</h3>
            <p>{payModal.member_name} — {parseFloat(payModal.amount).toLocaleString()}</p>
            <form onSubmit={handlePay}>
              <div className="form-group"><label>Payment Date</label><input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required /></div>
              <div className="form-actions"><button type="submit" className="btn btn-primary">Confirm</button><button type="button" className="btn btn-secondary" onClick={() => setPayModal(null)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
