import { useState, useEffect } from 'react';
import { api } from '../api';
import { formatDate } from '../utils/formatDate';

function filterList(list, search) {
  if (!search?.trim()) return list;
  const q = search.toLowerCase().trim();
  return list.filter(r => {
    const member = (r.member_name || '').toLowerCase();
    const amount = (r.amount ?? 0).toString();
    const date = formatDate(r.payment_date) || '';
    return member.includes(q) || amount.includes(q) || date.includes(q);
  });
}

export default function RegistrationFees() {
  const [list, setList] = useState([]);
  const [members, setMembers] = useState([]);
  const [settings, setSettings] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ member_id: '', amount: '', payment_date: '' });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.registrationFees.list().then(setList),
      api.members.list().then(setMembers),
      api.settings.get().then(setSettings)
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = filterList(list, search);
  const regFeeAmount = parseFloat(settings.registration_fee_amount || 500);
  const paidMemberIds = new Set(list.map(r => r.member_id));
  const membersWithoutFee = members.filter(m => m.status === 'Active' && !paidMemberIds.has(m.id));
  const total = list.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  const openAdd = () => {
    const d = new Date();
    const defaultMember = membersWithoutFee.length ? membersWithoutFee[0].id : '';
    setForm({ member_id: defaultMember, amount: regFeeAmount, payment_date: d.toISOString().slice(0, 10) });
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.registrationFees.create(form);
      setModal(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Registration Fees</h1>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={openAdd}>Record Registration Fee</button>
        </div>
      </div>

      <div className="card">
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Registration fee per member: {regFeeAmount.toLocaleString()}. Record when a member pays.</p>
        <div className="form-group" style={{ marginBottom: '1rem', maxWidth: 320 }}>
          <label>Search</label>
          <input type="search" placeholder="Search member, amount, date..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ marginBottom: '1rem', fontSize: '0.95rem', fontWeight: 600 }}>Total: {total.toLocaleString()} ({list.length} members paid)</div>
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
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td>{formatDate(r.payment_date)}</td>
                    <td>{r.member_name}</td>
                    <td>{parseFloat(r.amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Record Registration Fee</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Member</label>
                <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })} required>
                  <option value="">Select member</option>
                  {members.filter(m => m.status === 'Active').map(m => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}{paidMemberIds.has(m.id) ? ' (already paid)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Payment Date</label>
                <input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} required />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
