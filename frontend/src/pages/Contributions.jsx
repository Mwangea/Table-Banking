import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api, exportUrl } from '../api';
import { formatDate } from '../utils/formatDate';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';
import DeleteModal from '../components/DeleteModal';

const CACHE_KEY = 'table_banking_contributions';
const PAGE_SIZE = 10;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function filterContributions(list, search, monthFilter, yearFilter) {
  let out = list;
  if (monthFilter) out = out.filter(c => c.month == monthFilter);
  if (yearFilter) out = out.filter(c => c.year == yearFilter);
  if (!search?.trim()) return out;
  const q = search.toLowerCase().trim();
  return out.filter(c => {
    const member = (c.member_name || '').toLowerCase();
    const month = (c.month || '').toString();
    const year = (c.year || '').toString();
    const amount = (c.amount ?? 0).toString();
    const date = formatDate(c.contribution_date) || '';
    return member.includes(q) || month.includes(q) || year.includes(q) || amount.includes(q) || date.includes(q);
  });
}

const YEARS = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i);

export default function Contributions() {
  const [contributions, setContributions] = useState(() => {
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
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ member_id: '', amount: '', contribution_date: '', month: 1, year: new Date().getFullYear() });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.contributions.list().then(data => {
        setContributions(data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      }),
      api.members.list().then(data => {
        setMembers(data);
        try { localStorage.setItem('table_banking_members', JSON.stringify(data)); } catch {}
      })
    ]).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = filterContributions(contributions, search, monthFilter, yearFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, monthFilter, yearFilter]);

  const openAdd = () => {
    const d = new Date();
    setForm({ member_id: '', amount: '', contribution_date: d.toISOString().slice(0, 10), month: d.getMonth() + 1, year: d.getFullYear() });
    setModal('add');
  };

  const openEdit = (c) => {
    setForm({
      id: c.id,
      member_id: c.member_id,
      amount: c.amount,
      contribution_date: (c.contribution_date || '').toString().slice(0, 10),
      month: c.month,
      year: c.year
    });
    setModal('edit');
  };

  const openDelete = (c) => setDeleteTarget(c);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        await api.contributions.update(form.id, { member_id: form.member_id, amount: form.amount, contribution_date: form.contribution_date, month: form.month, year: form.year });
      } else {
        await api.contributions.create(form);
      }
      setModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.contributions.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
      toast.success('Contribution deleted.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
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
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Search</label>
            <input type="search" placeholder="Search member, month, year, amount, date..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
            <label>Month</label>
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
              <option value="">All months</option>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 100 }}>
            <label>Year</label>
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
              <option value="">All years</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {(monthFilter || yearFilter) && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setMonthFilter(''); setYearFilter(''); }}>
              Clear filters
            </button>
          )}
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(c => (
                    <tr key={c.id}>
                      <td>{formatDate(c.contribution_date)}</td>
                      <td>{c.member_name}</td>
                      <td>{MONTHS[c.month - 1] || c.month}</td>
                      <td>{c.year}</td>
                      <td>{parseFloat(c.amount).toLocaleString()}</td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                        <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => openDelete(c)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            <div className="table-cards">
              {paginated.map(c => (
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
                  <div className="table-card-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => openDelete(c)}>Delete</button>
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
            <h3>{modal === 'edit' ? 'Edit Contribution' : 'Record Contribution'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Member</label>
                <SearchableSelect
                  value={form.member_id}
                  onChange={val => setForm({ ...form, member_id: val })}
                  options={members.filter(m => m.status === 'Active' || m.id == form.member_id).map(m => ({ value: m.id, label: m.full_name }))}
                  placeholder="Select member"
                  required
                />
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
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving && <span className="loading-spinner" />}{saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteModal
          title="Delete Contribution"
          message={`Are you sure you want to delete the contribution of ${parseFloat(deleteTarget.amount).toLocaleString()} for ${deleteTarget.member_name}?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
