import { useState, useEffect } from 'react';
import { api, exportUrl } from '../api';
import { formatDate } from '../utils/formatDate';

export default function Reports() {
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberStatement, setMemberStatement] = useState(null);
  const [groupReport, setGroupReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fullReportFilter, setFullReportFilter] = useState({
    period: 'all',
    date: new Date().toISOString().slice(0, 10),
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  useEffect(() => {
    api.members.list().then(setMembers);
    api.reports.groupFinancial().then(setGroupReport).catch(console.error);
  }, []);

  const loadStatement = (id) => {
    setSelectedMember(id);
    setLoading(true);
    api.reports.memberStatement(id).then(setMemberStatement).catch(console.error).finally(() => setLoading(false));
  };

  const fullReportParams = () => {
    const { period, date, month, year } = fullReportFilter;
    if (period === 'all') return {};
    const p = { period };
    if (period === 'day' || period === 'week') p.date = date;
    if (period === 'month') { p.month = month; p.year = year; }
    if (period === 'year') p.year = year;
    return p;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <div className="page-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <a href={exportUrl('/export/members')} className="btn btn-secondary" target="_blank" rel="noreferrer">Members</a>
          <a href={exportUrl('/export/contributions')} className="btn btn-secondary" target="_blank" rel="noreferrer">Contributions</a>
          <a href={exportUrl('/export/loans')} className="btn btn-secondary" target="_blank" rel="noreferrer">Loans</a>
          <a href={exportUrl('/export/repayments')} className="btn btn-secondary" target="_blank" rel="noreferrer">Repayments</a>
          <a href={exportUrl('/export/external-funds')} className="btn btn-secondary" target="_blank" rel="noreferrer">External Funds</a>
          <a href={exportUrl('/export/expenses')} className="btn btn-secondary" target="_blank" rel="noreferrer">Expenses</a>
          <a href={exportUrl('/export/registration-fees')} className="btn btn-secondary" target="_blank" rel="noreferrer">Reg. Fees</a>
          <a href={exportUrl('/export/fines')} className="btn btn-secondary" target="_blank" rel="noreferrer">Fines</a>
          <a href={exportUrl('/export/monthly-summary')} className="btn btn-secondary" target="_blank" rel="noreferrer">Monthly Summary</a>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Full Report (Filter & Download)</h3>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Download a complete Excel workbook: Members, Contributions, Loans, Repayments, External Funds, Expenses, Reg. Fees, Fines, Monthly Summary, and Member Summary.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Period</label>
            <select value={fullReportFilter.period} onChange={e => setFullReportFilter(f => ({ ...f, period: e.target.value }))}>
              <option value="all">All time</option>
              <option value="day">Specific day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
          {(fullReportFilter.period === 'day' || fullReportFilter.period === 'week') && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Date</label>
              <input type="date" value={fullReportFilter.date} onChange={e => setFullReportFilter(f => ({ ...f, date: e.target.value }))} />
            </div>
          )}
          {(fullReportFilter.period === 'month' || fullReportFilter.period === 'year') && (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Month</label>
                <select value={fullReportFilter.month} onChange={e => setFullReportFilter(f => ({ ...f, month: +e.target.value }))}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Year</label>
                <select value={fullReportFilter.year} onChange={e => setFullReportFilter(f => ({ ...f, year: +e.target.value }))}>
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <a href={api.exportFullReportUrl(fullReportParams())} className="btn btn-primary" target="_blank" rel="noreferrer">
            Download Full Report
          </a>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Export to Excel</h3>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>Download individual reports in Excel format. Includes Members (with reg. fee status), Contributions, Loans, Repayments, External Funds, Expenses, Reg. Fees, Fines, and Monthly Summary.</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Member Statement</h3>
        </div>
        <div className="form-group" style={{ maxWidth: 300 }}>
          <label>Select Member</label>
          <select value={selectedMember || ''} onChange={e => loadStatement(e.target.value)}>
            <option value="">Choose member</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
        {selectedMember && (
          <div style={{ marginTop: '1rem' }}>
            <a href={exportUrl(`/export/member-statement/${selectedMember}`)} className="btn btn-primary" target="_blank" rel="noreferrer">Export Statement</a>
          </div>
        )}
        {loading && <div className="loading" style={{ padding: '1rem' }}><span className="loading-spinner" />Loading...</div>}
        {memberStatement && !loading && (
          <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>{memberStatement.member?.full_name}</h4>
            <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ margin: 0 }}>Total Contributions: <strong>{memberStatement.totalContributions?.toLocaleString()}</strong></p>
              <p style={{ margin: 0 }}>Reg. Fee Paid: <strong>{memberStatement.totalRegFee?.toLocaleString() || 0}</strong></p>
              <p style={{ margin: 0 }}>Fines Paid: <strong>{memberStatement.finesPaid?.toLocaleString() || 0}</strong></p>
              <p style={{ margin: 0 }}>Fines Unpaid: <strong>{memberStatement.finesUnpaid?.toLocaleString() || 0}</strong></p>
              <p style={{ margin: 0 }}>Outstanding Balance: <strong>{memberStatement.totalOutstandingBalance?.toLocaleString()}</strong></p>
              <p style={{ margin: 0 }}>Net Position: <strong>{memberStatement.netPosition?.toLocaleString()}</strong></p>
            </div>
            <div>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Recent Contributions</strong>
              <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
                <table>
                  <thead><tr><th>Date</th><th>Month</th><th>Year</th><th>Amount</th></tr></thead>
                  <tbody>
                    {memberStatement.contributions?.slice(0, 10).map(c => (
                      <tr key={c.id}><td>{formatDate(c.contribution_date)}</td><td>{c.month}</td><td>{c.year}</td><td>{parseFloat(c.amount).toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Group Financial Report</h3>
        </div>
        {groupReport && (
          <div>
            <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ margin: 0 }}>Total Loans Issued: <strong>{groupReport.totalLoansIssued}</strong></p>
              <p style={{ margin: 0 }}>Total Loan Amount: <strong>{groupReport.totalLoanAmount?.toLocaleString()}</strong></p>
              <p style={{ margin: 0 }}>Total Interest Earned: <strong>{groupReport.totalInterestEarned?.toLocaleString()}</strong></p>
              <p style={{ margin: 0 }}>External Funds: <strong>{groupReport.totalExternalFunds?.toLocaleString()}</strong></p>
              <p style={{ margin: 0 }}>Registration Fees: <strong>{groupReport.totalRegFees?.toLocaleString()}</strong></p>
              <p style={{ margin: 0 }}>Fines (Paid): <strong>{groupReport.totalFinesPaid?.toLocaleString()}</strong></p>
              <p style={{ margin: 0 }}>Expenses: <strong>{groupReport.totalExpenses?.toLocaleString()}</strong></p>
              <p style={{ margin: 0 }}>Defaulted Loans: <strong>{groupReport.defaultedLoans?.length || 0}</strong></p>
            </div>
            <div>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Monthly Contributions</strong>
              <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
                <table>
                  <thead><tr><th>Month</th><th>Year</th><th>Total</th></tr></thead>
                  <tbody>
                    {groupReport.monthlyContributions?.slice(0, 12).map((c, i) => (
                      <tr key={i}><td>{c.month}</td><td>{c.year}</td><td>{parseFloat(c.total).toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
