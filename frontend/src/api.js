const API = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  auth: { login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }) },
  members: {
    list: () => request('/members'),
    get: (id) => request(`/members/${id}`),
    create: (body) => request('/members', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/members/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/members/${id}`, { method: 'DELETE' })
  },
  contributions: {
    list: (params) => request('/contributions' + (params ? '?' + new URLSearchParams(params).toString() : '')),
    create: (body) => request('/contributions', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/contributions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/contributions/${id}`, { method: 'DELETE' })
  },
  loans: {
    list: (params) => request('/loans' + (params ? '?' + new URLSearchParams(params).toString() : '')),
    get: (id) => request(`/loans/${id}`),
    create: (body) => request('/loans', { method: 'POST', body: JSON.stringify(body) }),
    updateStatus: (id, status) => request(`/loans/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) })
  },
  repayments: {
    list: (params) => request('/repayments' + (params ? '?' + new URLSearchParams(params).toString() : '')),
    create: (body) => request('/repayments', { method: 'POST', body: JSON.stringify(body) })
  },
  externalFunds: {
    list: () => request('/external-funds'),
    create: (body) => request('/external-funds', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/external-funds/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/external-funds/${id}`, { method: 'DELETE' })
  },
  expenses: {
    list: () => request('/expenses'),
    create: (body) => request('/expenses', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/expenses/${id}`, { method: 'DELETE' })
  },
  registrationFees: {
    list: () => request('/registration-fees'),
    create: (body) => request('/registration-fees', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/registration-fees/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/registration-fees/${id}`, { method: 'DELETE' })
  },
  fines: {
    list: (params) => request('/fines' + (params ? '?' + new URLSearchParams(params).toString() : '')),
    create: (body) => request('/fines', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/fines/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    pay: (id, body) => request(`/fines/${id}/pay`, { method: 'PUT', body: JSON.stringify(body || {}) }),
    delete: (id) => request(`/fines/${id}`, { method: 'DELETE' })
  },
  dashboard: () => request('/dashboard'),
  reports: {
    memberStatement: (id) => request(`/reports/member-statement/${id}`),
    groupFinancial: () => request('/reports/group-financial')
  },
  settings: {
    get: () => request('/settings'),
    update: (body) => request('/settings', { method: 'PUT', body: JSON.stringify(body) })
  },
  users: {
    list: () => request('/users'),
    create: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) })
  },
  export: (path) => {
    const token = getToken();
    window.open(API + path + (path.includes('?') ? '&' : '?') + 'token=' + token, '_blank');
  },
  exportFullReportUrl: (params) => {
    const token = getToken();
    const qs = new URLSearchParams({ token, ...params }).toString();
    return API + '/export/full-report?' + qs;
  }
};

export function exportUrl(path) {
  const token = getToken();
  return API + path + '?token=' + encodeURIComponent(token);
}
