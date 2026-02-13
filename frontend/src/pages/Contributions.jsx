import { useState, useEffect } from 'react';
import { api, exportUrl } from '../api';
import { formatDate } from '../utils/formatDate';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function filterContributions(list, search) {
  if (!search?.trim()) return list;
  const q = search.toLowerCase().trim();
  return list.filter(c => {
    const member = (c.member_name || '').toLowerCase();
    const month = (c.month || '').toString();
    const year = (c.year || '').toString();
    const amount = (c.amount ?? 0).toString();
    const date = formatDate(c.contribution_date) || '';
    return member.includes(q) || month.includes(q) || year.includes(q) || amount.includes(q) || date.includes(q);
  });
}

export default function Contributions() {
  const [contributions, setContributions] = useState([]);
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ member_id: '', amount: '', contribution_date: '', month: 1, year: new Date().getFullYear() });

  const load = () => {
    setLoading(true);
    Promise.all([api.contributions.list().then(setContributions), api.members.list().then(setMembers)])
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = filterContributions(contributions, search);

  const openAdd = () => {
    const d = new Date();
    setForm({ member_id: '', amount: '', contribution_date: d.toISOString().slice(0, 10), month: d.getMonth() + 1, year: d.getFullYear() });
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.contributions.create(form);
      setModal(false);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Contributions</h1>
        <div className="page-actions">
          <a href={exportUrl('/export/contributions')} className="btn btn-secondary" target="_blank" rel="noreferrer">Export</a>
          <button type="button" className="btn btn-primary" onClick={openAdd}>Record Contribution</button>
        </div>
      </div>

      <div className="card">
        <div className="form-group" style={{ marginBottom: '1rem', maxWidth: 320 }}>
          <label>Search</label>
          <input type="search" placeholder="Search member, month, year, amount, date..." value={search} onChange={e => setSearch(e.target.value)} />
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
                    <th>Month</th>
                    <th>Year</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id}>
                      <td>{formatDate(c.contribution_date)}</td>
                      <td>{c.member_name}</td>
                      <td>{MONTHS[c.month - 1] || c.month}</td>
                      <td>{c.year}</td>
                      <td>{parseFloat(c.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-cards">
              {filtered.map(c => (
                <div key={c.id} className="table-card">
                  <div className="table-card-row">
                    <label>Member</label>
                    <span>{c.member_name}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Date</label>
                    <span>{formatDate(c.contribution_date)}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Amount</label>
                    <span>{parseFloat(c.amount).toLocaleString()}</span>
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
            <h3>Record Contribution</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Member</label>
                <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })} required>
                  <option value="">Select member</option>
                  {members.filter(m => m.status === 'Active').map(m => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Amount</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.contribution_date} onChange={e => setForm({ ...form, contribution_date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Month</label>
                <select value={form.month} onChange={e => setForm({ ...form, month: parseInt(e.target.value) })}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Year</label>
                <input type="number" value={form.year} onChange={e => setForm({ ...form, year: parseInt(e.target.value) })} required />
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
