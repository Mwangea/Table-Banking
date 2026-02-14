import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api, exportUrl } from '../api';
import { formatDate } from '../utils/formatDate';
import DeleteModal from '../components/DeleteModal';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 10;

const CACHE_KEY = 'table_banking_members';

function filterMembers(list, search) {
  if (!search?.trim()) return list;
  const q = search.toLowerCase().trim();
  return list.filter(m => {
    const name = (m.full_name || '').toLowerCase();
    const phone = (m.phone || '').toString();
    const nationalId = (m.national_id || '').toString();
    const dateJoined = formatDate(m.date_joined) || '';
    const status = (m.status || '').toLowerCase();
    const contrib = (m.total_contributions ?? 0).toString();
    return name.includes(q) || phone.includes(q) || nationalId.includes(q) ||
      dateJoined.includes(q) || status.includes(q) || contrib.includes(q);
  });
}

export default function Members() {
  const [members, setMembers] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', national_id: '', date_joined: '', status: 'Active', record_reg_fee: false });
  const [settings, setSettings] = useState({});
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  const load = () => {
    setLoading(true);
    api.members.list().then(data => {
      setMembers(data);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    }).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { api.settings.get().then(setSettings).catch(() => {}); }, []);

  const filtered = filterMembers(members, search);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search]);

  const openAdd = () => {
    setModal('add');
    setForm({
      full_name: '',
      phone: '',
      national_id: '',
      date_joined: new Date().toISOString().slice(0, 10),
      status: 'Active',
      record_reg_fee: true
    });
  };
  const openEdit = (m) => { setModal('edit'); setForm({ ...m, date_joined: formatDate(m.date_joined) || m.date_joined?.slice(0, 10), status: m.status || 'Active' }); };
  const openDelete = (m) => setDeleteTarget(m);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.members.delete(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      await api.members.clearAll();
      setShowClearAllModal(false);
      setConfirmClearAll(false);
      load();
      toast.success('All members cleared');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClearingAll(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'add') {
        const { record_reg_fee, ...memberData } = form;
        const created = await api.members.create(memberData);
        if (record_reg_fee && created?.id) {
          const regFee = parseFloat(settings.registration_fee_amount || 500);
          const today = new Date().toISOString().slice(0, 10);
          await api.registrationFees.create({ member_id: created.id, amount: regFee, payment_date: today });
        }
      } else {
        await api.members.update(form.id, { full_name: form.full_name, phone: form.phone, national_id: form.national_id, date_joined: form.date_joined, status: form.status });
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Members</h1>
        <div className="page-actions">
          <a href={exportUrl('/export/members')} className="btn btn-secondary" target="_blank" rel="noreferrer">Export</a>
          {isAdmin && <button type="button" className="btn btn-primary" onClick={openAdd}>Add Member</button>}
        </div>
      </div>

      {isAdmin && members.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmClearAll} onChange={e => setConfirmClearAll(e.target.checked)} />
            I understand this will permanently delete all members and their contributions, loans, registration fees, and fines
          </label>
          <button
            type="button"
            className="btn btn-danger"
            style={{ marginTop: '0.75rem' }}
            disabled={!confirmClearAll}
            onClick={() => setShowClearAllModal(true)}
          >
            Clear All Members
          </button>
        </div>
      )}

      <div className="card">
        <div className="form-group" style={{ marginBottom: '1rem', maxWidth: 320 }}>
          <label>Search</label>
          <input type="search" placeholder="Search name, phone, ID, date, status, contributions..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? (
          <div className="loading"><span className="loading-spinner" />Loading...</div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>National ID</th>
                    <th>Date Joined</th>
                    <th>Status</th>
                    <th>Reg. Fee</th>
                    <th>Contributions</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(m => (
                    <tr key={m.id}>
                      <td>{m.full_name}</td>
                      <td>{m.phone}</td>
                      <td>{m.national_id || '-'}</td>
                      <td>{formatDate(m.date_joined)}</td>
                      <td><span className={`badge badge-${m.status?.toLowerCase()}`}>{m.status}</span></td>
                      <td>{parseFloat(m.registration_fee_paid || 0) > 0 ? '✓' : '-'}</td>
                      <td>{parseFloat(m.total_contributions || 0).toLocaleString()}</td>
                      {isAdmin && (
                        <td>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(m)}>Edit</button>
                          <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => openDelete(m)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            <div className="table-cards">
              {paginated.map(m => (
                <div key={m.id} className="table-card">
                  <div className="table-card-row">
                    <label>Name</label>
                    <span>{m.full_name}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Phone</label>
                    <span>{m.phone}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Date Joined</label>
                    <span>{formatDate(m.date_joined)}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Reg. Fee</label>
                    <span>{parseFloat(m.registration_fee_paid || 0) > 0 ? '✓ Paid' : '-'}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Contributions</label>
                    <span>{parseFloat(m.total_contributions || 0).toLocaleString()}</span>
                  </div>
                  <div className="table-card-row">
                    <label>Status</label>
                    <span className={`badge badge-${m.status?.toLowerCase()}`}>{m.status}</span>
                  </div>
                  {isAdmin && (
                    <div className="table-card-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(m)}>Edit</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => openDelete(m)}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{modal === 'add' ? 'Add Member' : 'Edit Member'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Full Name</label>
                <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>National ID</label>
                <input value={form.national_id} onChange={e => setForm({ ...form, national_id: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Date Joined</label>
                <input type="date" value={form.date_joined} onChange={e => setForm({ ...form, date_joined: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              {modal === 'add' && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={form.record_reg_fee || false} onChange={e => setForm({ ...form, record_reg_fee: e.target.checked })} />
                    Record registration fee ({parseFloat(settings.registration_fee_amount || 500).toLocaleString()})
                  </label>
                </div>
              )}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving && <span className="loading-spinner" />}{saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteModal
          title="Delete Member"
          message={`Are you sure you want to delete ${deleteTarget.full_name}? This will remove all their contributions and loan records.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {showClearAllModal && (
        <DeleteModal
          title="Clear All Members"
          message="Are you sure you want to delete all members? This will permanently remove all members and their contributions, loans, registration fees, and fines. This cannot be undone."
          onConfirm={handleClearAll}
          onCancel={() => setShowClearAllModal(false)}
          loading={clearingAll}
        />
      )}
    </div>
  );
}
