import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export default function Layout({ user, onLogout, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { to: '/', label: 'Dashboard' },
    { to: '/members', label: 'Members' },
    { to: '/contributions', label: 'Contributions' },
    { to: '/loans', label: 'Loans' },
    { to: '/repayments', label: 'Repayments' },
    { to: '/transactions', label: 'Transactions' },
    { to: '/reports', label: 'Reports' },
    ...(isAdmin ? [{ to: '/settings', label: 'Settings' }] : [])
  ];

  const pageTitles = {
    '/': 'Dashboard',
    '/members': 'Members',
    '/contributions': 'Contributions',
    '/loans': 'Loans',
    '/repayments': 'Repayments',
    '/transactions': 'Transactions',
    '/reports': 'Reports',
    '/settings': 'Settings'
  };
  const appName = 'Mbogi Finance Help Group';
  const appNameShort = 'MFHG';
  const currentTitle = pageTitles[location.pathname] || appName;

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app">
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={closeSidebar} aria-hidden="true" />
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <h2>
            <span className="brand-full">Mbogi <span>Finance Help Group</span></span>
            <span className="brand-short" title="Mbogi Finance Help Group">MFHG</span>
          </h2>
        </div>
        <nav>
          {navItems.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={closeSidebar}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">{user?.username}</div>
          <button type="button" className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button type="button" className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            &#9776;
          </button>
          <span className="topbar-title">
            <span className="title-full">{currentTitle}</span>
            <span className="title-short" title={currentTitle}>
              {currentTitle === appName ? appNameShort : currentTitle}
            </span>
          </span>
          <div style={{ width: 40 }} />
        </header>
        <div className="main-content">{children}</div>
      </main>
    </div>
  );
}
