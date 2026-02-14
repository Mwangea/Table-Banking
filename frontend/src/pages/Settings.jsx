import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState({ max_loan_multiplier: '3', default_interest_rate: '10', registration_fee_amount: '500', default_fine_amount: '100' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'treasurer' });
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    api.settings.get().then(s => {
      setSettings(s);
      setForm({
        max_loan_multiplier: s.max_loan_multiplier || '3',
        default_interest_rate: s.default_interest_rate || '10',
        registration_fee_amount: s.registration_fee_amount || '500',
        default_fine_amount: s.default_fine_amount || '100'
      });
    }).finally(() => setLoading(false));
    api.users.list().then(setUsers).catch(() => setUsers([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.settings.update(form);
      setSettings({ ...settings, ...form });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreatingUser(true);
    try {
      await api.users.create(userForm);
      setUserForm({ username: '', password: '', role: 'treasurer' });
      api.users.list().then(setUsers);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingUser(false);
    }
  };

  if (loading) return <div className="loading"><span className="loading-spinner" />Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Business Rules</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Max Loan Multiplier (× contributions)</label>
            <input type="number" step="0.1" value={form.max_loan_multiplier} onChange={e => setForm({ ...form, max_loan_multiplier: e.target.value })} />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem', display: 'block' }}>Members cannot borrow more than this times their total contributions</small>
          </div>
          <div className="form-group">
            <label>Default Interest Rate (%)</label>
            <input type="number" step="0.1" value={form.default_interest_rate} onChange={e => setForm({ ...form, default_interest_rate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Registration Fee (per member)</label>
            <input type="number" step="0.01" value={form.registration_fee_amount} onChange={e => setForm({ ...form, registration_fee_amount: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Default Fine Amount</label>
            <input type="number" step="0.01" value={form.default_fine_amount} onChange={e => setForm({ ...form, default_fine_amount: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">User Management</h3>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Create treasurer or admin accounts. Default: admin/admin123, treasurer/treasurer123 (run <code>npm run seed</code> if needed).
        </p>
        <div className="table-wrapper" style={{ marginBottom: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td><span className={`badge badge-${u.role === 'admin' ? 'active' : 'ongoing'}`}>{u.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={handleCreateUser}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }} className="form-row-responsive">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Username</label>
              <input value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} required placeholder="New username" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Password</label>
              <input type="password" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} required placeholder="Password" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Role</label>
              <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
                <option value="treasurer">Treasurer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={creatingUser}>{creatingUser ? 'Creating...' : 'Add User'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
