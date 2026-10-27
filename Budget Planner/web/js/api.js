// Thin wrapper around the Java REST API.
const BASE = (window.API_BASE || '').replace(/\/$/, '');

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new Error("Can't reach the server. Check that the Java app is running.");
  }
  if (!res.ok) {
    let message = 'Something went wrong. Please try again.';
    try { message = (await res.json()).error || message; } catch { /* keep default */ }
    throw new Error(message);
  }
  return res.json();
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  months: () => request('/months'),
  month: (ym) => request(`/months/${ym}`),
  saveMonth: (ym, body) => request(`/months/${ym}`, json('PUT', body)),
  expenses: (ym) => request(`/months/${ym}/expenses`),
  addExpense: (ym, body) => request(`/months/${ym}/expenses`, json('POST', body)),
  updateExpense: (id, body) => request(`/expenses/${id}`, json('PUT', body)),
  deleteExpense: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),
  exportUrl: `${BASE}/api/export.csv`,
};