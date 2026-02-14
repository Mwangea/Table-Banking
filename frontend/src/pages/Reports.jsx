import { useState, useEffect, useRef } from 'react';
import { api, exportUrl } from '../api';
import SearchableSelect from '../components/SearchableSelect';
import { formatDate } from '../utils/formatDate';
import { FiDownload, FiFileText, FiChevronDown, FiUser } from 'react-icons/fi';

const EXCEL_EXPORTS = [
  { label: 'Members', path: '/export/members' },
  { label: 'Contributions', path: '/export/contributions' },
  { label: 'Loans', path: '/export/loans' },
  { label: 'Repayments', path: '/export/repayments' },
  { label: 'External Funds', path: '/export/external-funds' },
  { label: 'Expenses', path: '/export/expenses' },
  { label: 'Registration Fees', path: '/export/registration-fees' },
  { label: 'Fines', path: '/export/fines' },
  { label: 'Monthly Summary', path: '/export/monthly-summary' }
];

export default function Reports() {
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberStatement, setMemberStatement] = useState(null);
  const [groupReport, setGroupReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
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

  useEffect(() => {
    const fn = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setExportDropdownOpen(false); };
    document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
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
    <div className="reports-page">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
      </div>

      <div className="reports-quick-bar">
        <a href={exportUrl('/export/financial-report-pdf')} className="reports-quick-btn reports-quick-primary" target="_blank" rel="noreferrer">
          <FiDownload size={18} /> Download PDF Report
        </a>
        <div className="reports-dropdown" ref={dropdownRef}>
          <button
            type="button"
            className="reports-quick-btn reports-quick-secondary"
            onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
            aria-expanded={exportDropdownOpen}
          >
            Individual Excel <FiChevronDown size={16} style={{ opacity: exportDropdownOpen ? 1 : 0.7 }} />
          </button>
          {exportDropdownOpen && (
            <div className="reports-dropdown-menu">
              {EXCEL_EXPORTS.map(({ label, path }) => (
                <a key={path} href={exportUrl(path)} target="_blank" rel="noreferrer" className="reports-dropdown-item">
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="reports-full-card">
        <h3 className="reports-full-title">Full Excel Report</h3>
        <div className="reports-full-filters">
          <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
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
            <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
              <label>Date</label>
              <input type="date" value={fullReportFilter.date} onChange={e => setFullReportFilter(f => ({ ...f, date: e.target.value }))} />
            </div>
          )}
          {(fullReportFilter.period === 'month' || fullReportFilter.period === 'year') && (
            <>
              <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
                <label>Month</label>
                <select value={fullReportFilter.month} onChange={e => setFullReportFilter(f => ({ ...f, month: +e.target.value }))}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, minWidth: 90 }}>
                <label>Year</label>
                <select value={fullReportFilter.year} onChange={e => setFullReportFilter(f => ({ ...f, year: +e.target.value }))}>
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <a href={api.exportFullReportUrl(fullReportParams())} className="reports-quick-btn reports-quick-secondary" target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-end' }}>
            <FiFileText size={18} /> Download Full Report
          </a>
        </div>
        <p className="reports-full-hint">Complete workbook: Members, Contributions, Loans, Repayments, External Funds, Expenses, Reg. Fees, Fines, Monthly Summary, Member Summary.</p>
      </div>

      <div className="reports-grid">
        <div className="card reports-card">
          <div className="reports-card-header">
            <h3 className="card-title">Group Financial Report</h3>
            <a href={exportUrl('/export/financial-report-pdf')} className="btn btn-primary btn-sm" target="_blank" rel="noreferrer">
              <FiDownload size={14} /> PDF
            </a>
          </div>
          {groupReport && (
            <div className="reports-card-body">
              <div className="reports-stats-grid">
                <div className="reports-stat"><span className="reports-stat-label">Total Loans Issued</span><span className="reports-stat-value">{groupReport.totalLoansIssued}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">Total Loan Amount</span><span className="reports-stat-value">{groupReport.totalLoanAmount?.toLocaleString()}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">Interest Earned</span><span className="reports-stat-value">{groupReport.totalInterestEarned?.toLocaleString()}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">External Funds</span><span className="reports-stat-value">{groupReport.totalExternalFunds?.toLocaleString()}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">Registration Fees</span><span className="reports-stat-value">{groupReport.totalRegFees?.toLocaleString()}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">Fines (Paid)</span><span className="reports-stat-value">{groupReport.totalFinesPaid?.toLocaleString()}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">Expenses</span><span className="reports-stat-value">{groupReport.totalExpenses?.toLocaleString()}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">Defaulted Loans</span><span className="reports-stat-value">{groupReport.defaultedLoans?.length || 0}</span></div>
              </div>
              <div className="reports-table-section">
                <strong className="reports-table-title">Monthly Contributions</strong>
                <div className="table-wrapper">
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

        <div className="card reports-card">
          <div className="reports-card-header">
            <h3 className="card-title">Member Statement</h3>
          </div>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label>Select Member</label>
            <SearchableSelect
              value={selectedMember || ''}
              onChange={val => loadStatement(val)}
              options={members.map(m => ({ value: m.id, label: m.full_name }))}
              placeholder="Choose member"
            />
          </div>
          {selectedMember && (
            <a href={exportUrl(`/export/member-statement/${selectedMember}`)} className="btn btn-secondary btn-sm" style={{ marginBottom: '1rem' }} target="_blank" rel="noreferrer">
              <FiDownload size={14} /> Export Statement
            </a>
          )}
          {loading && <div className="loading" style={{ padding: '1rem' }}><span className="loading-spinner" />Loading...</div>}
          {memberStatement && !loading && (
            <div className="reports-member-detail">
              <div className="reports-member-header">
                <FiUser size={20} />
                <h4>{memberStatement.member?.full_name}</h4>
              </div>
              <div className="reports-member-stats">
                <div className="reports-stat"><span className="reports-stat-label">Contributions</span><span className="reports-stat-value">{memberStatement.totalContributions?.toLocaleString()}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">Reg. Fee</span><span className="reports-stat-value">{memberStatement.totalRegFee?.toLocaleString() || 0}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">Fines Paid</span><span className="reports-stat-value">{memberStatement.finesPaid?.toLocaleString() || 0}</span></div>
                <div className="reports-stat"><span className="reports-stat-label">Outstanding</span><span className="reports-stat-value">{memberStatement.totalOutstandingBalance?.toLocaleString()}</span></div>
                <div className="reports-stat reports-stat-highlight"><span className="reports-stat-label">Net Position</span><span className="reports-stat-value">{memberStatement.netPosition?.toLocaleString()}</span></div>
              </div>
              <div className="reports-table-section">
                <strong className="reports-table-title">Recent Contributions</strong>
                <div className="table-wrapper">
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
      </div>
    </div>
  );
}
