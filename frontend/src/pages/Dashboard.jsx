import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiUsers, FiDollarSign, FiFileText, FiClock, FiBriefcase } from 'react-icons/fi';
import { api } from '../api';
import { formatDate } from '../utils/formatDate';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <span className="loading-spinner" />
        Loading dashboard...
      </div>
    );
  }
  if (!data) return <div className="card">Failed to load dashboard</div>;

  const availableCash = data.availableCashInGroup ?? 0;
  const poolTotal = data.poolTotal ?? 0;
  const totalContrib = data.totalContributions ?? 0;
  const outstanding = data.totalOutstandingBalance ?? 0;

  const hasDefaulted = (data.defaultedLoans?.length ?? 0) > 0;

  return (
    <div className="dashboard dashboard-clean">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <section className="dashboard-hero">
        <div className="hero-card">
          <FiBriefcase className="hero-icon" size={28} />
          <div className="hero-content">
            <span className="hero-label">Available to Lend</span>
            <span className="hero-value">{availableCash.toLocaleString()}</span>
            <span className="hero-sub">Contributions + Repayments + External + Reg + Fines − Principal Lent − Expenses</span>
          </div>
        </div>
      </section>

      <section className="dashboard-stats-primary">
        <div className="stat-card stat-primary">
          <FiUsers size={18} className="stat-icon" />
          <span className="value">{data.totalMembers ?? 0}</span>
          <span className="label">Members</span>
        </div>
        <div className="stat-card stat-primary">
          <FiDollarSign size={18} className="stat-icon" />
          <span className="value">{totalContrib.toLocaleString()}</span>
          <span className="label">Contributions</span>
        </div>
        <div className="stat-card stat-primary">
          <FiClock size={18} className="stat-icon" />
          <span className="value">{outstanding.toLocaleString()}</span>
          <span className="label">Outstanding</span>
        </div>
        <div className="stat-card stat-primary">
          <FiFileText size={18} className="stat-icon" />
          <span className="value">{data.totalActiveLoans ?? 0}</span>
          <span className="label">Active Loans</span>
        </div>
      </section>

      <section className="dashboard-stats-secondary">
        <span className="stat-mini"><strong>Lent:</strong> {(data.totalMoneyLoaned ?? 0).toLocaleString()}</span>
        <span className="stat-mini"><strong>Repaid:</strong> {(data.totalMoneyRepaid ?? 0).toLocaleString()}</span>
        <span className="stat-mini"><strong>Interest:</strong> {(data.totalInterestEarned ?? 0).toLocaleString()}</span>
        <span className="stat-mini"><strong>External:</strong> {(data.totalExternalFunds ?? 0).toLocaleString()}</span>
        <span className="stat-mini"><strong>Reg fees:</strong> {(data.totalRegFees ?? 0).toLocaleString()}</span>
        <span className="stat-mini"><strong>Fines:</strong> {(data.totalFinesPaid ?? 0).toLocaleString()}</span>
        <span className="stat-mini"><strong>Expenses:</strong> {(data.totalExpenses ?? 0).toLocaleString()}</span>
      </section>

      {hasDefaulted && (
        <div className="alert alert-warning">
          <strong>Defaulted:</strong> {data.defaultedLoans?.length ?? 0} loan(s) — {(data.defaultedLoans?.reduce((s, l) => s + parseFloat(l.balance || 0), 0) || 0).toLocaleString()} outstanding
          <Link to="/loans" className="alert-link">View →</Link>
        </div>
      )}

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Recent Contributions</h3>
            <Link to="/contributions" className="dashboard-link">View all</Link>
          </div>
          <div className="dashboard-list">
            {data.recentContributions?.length ? (
              data.recentContributions.map(c => (
                <div key={c.id} className="dashboard-list-item">
                  <div>
                    <span className="item-name">{c.member_name}</span>
                    <span className="item-date">{formatDate(c.contribution_date)}</span>
                  </div>
                  <span className="item-amount">{parseFloat(c.amount).toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className="dashboard-empty">No contributions yet</p>
            )}
          </div>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card-header">
            <h3>Recent Repayments</h3>
            <Link to="/repayments" className="dashboard-link">View all</Link>
          </div>
          <div className="dashboard-list">
            {data.recentRepayments?.length ? (
              data.recentRepayments.map(r => (
                <div key={r.id} className="dashboard-list-item">
                  <div>
                    <span className="item-name">{r.member_name}</span>
                    <span className="item-date">{formatDate(r.payment_date)}</span>
                  </div>
                  <span className="item-amount">{parseFloat(r.amount_paid).toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className="dashboard-empty">No repayments yet</p>
            )}
          </div>
        </section>

        <section className="dashboard-card dashboard-card-full">
          <div className="dashboard-card-header">
            <h3>Active Loans</h3>
            <Link to="/loans" className="dashboard-link">View all</Link>
          </div>
          <div className="dashboard-list">
            {data.activeLoans?.length ? (
              data.activeLoans.map(l => (
                <div key={l.id} className="dashboard-list-item">
                  <div>
                    <span className="item-name">{l.member_name}</span>
                    <span className={`badge badge-${(l.status || '').toLowerCase()}`}>{l.status}</span>
                  </div>
                  <span className="item-amount">Bal: {parseFloat(l.balance || 0).toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className="dashboard-empty">No active loans</p>
            )}
          </div>
        </section>
      </div>

      <section className="quick-actions-section">
        <div className="quick-actions">
          <Link to="/contributions" className="quick-action-btn">Record Contribution</Link>
          <Link to="/repayments" className="quick-action-btn">Record Repayment</Link>
          <Link to="/transactions" className="quick-action-btn">Transactions</Link>
          <Link to="/loans" className="quick-action-btn">Loans</Link>
          <Link to="/reports" className="quick-action-btn">Reports</Link>
        </div>
      </section>
    </div>
  );
}
