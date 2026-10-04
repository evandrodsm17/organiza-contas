let authCallback = () => {};
let currentUid;
const observers = new Set();

async function request(path, method = 'GET', data, headers = {}) {
  const options = { method, credentials: 'same-origin', headers: { 'X-Organiza-Request': '1', ...headers } };
  if (data !== undefined) {
    if (data instanceof File) options.body = data;
    else { options.body = JSON.stringify(data); options.headers['Content-Type'] = 'application/json'; }
  }
  const response = await fetch(`/api${path}`, options);
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && currentUid) { currentUid = null; authCallback(null); }
    throw new Error(result.error || 'Não foi possível concluir a operação.');
  }
  if (method !== 'GET') for (const refresh of observers) refresh();
  return result;
}

function observe(path, callback, onError = console.error) {
  let stopped = false, running = false, pending = false, previous, timer;
  const refresh = async () => {
    if (stopped) return;
    if (running) { pending = true; return; }
    running = true; clearTimeout(timer);
    try {
      const items = await request(path);
      const serialized = JSON.stringify(items);
      if (!stopped && serialized !== previous) { previous = serialized; callback(items); }
    } catch (error) { if (!stopped) onError(error); }
    finally {
      running = false;
      if (!stopped) { const delay = pending ? 0 : 5000; pending = false; timer = setTimeout(refresh, delay); }
    }
  };
  observers.add(refresh); refresh();
  return () => { stopped = true; observers.delete(refresh); clearTimeout(timer); };
}
const managementPath = mid => `/managements/${encodeURIComponent(mid)}`;
const recordsPath = (mid, kind, id) => `${managementPath(mid)}/${kind}${id ? `/${encodeURIComponent(id)}` : ''}`;

export const ApiService = {
  isConfigured: () => true,
  observeAuth(callback) {
    authCallback = callback;
    let stopped = false, timer;
    const refresh = async () => {
      try {
        const user = await request('/auth/me');
        if (!stopped && currentUid !== (user?.uid || null)) { currentUid = user?.uid || null; await callback(user); }
      } catch (error) {
        console.error('Falha ao verificar sessão:', error);
        if (!stopped && currentUid === undefined) { currentUid = null; await callback(null); }
      } finally { if (!stopped) timer = setTimeout(refresh, 15000); }
    };
    refresh();
    return () => { stopped = true; clearTimeout(timer); authCallback = () => {}; };
  },
  async login(email, password) {
    const user = await request('/auth/login', 'POST', { email, password });
    currentUid = user.uid; await authCallback(user); return { user };
  },
  async loginWithGoogle() {
    const config = await request('/auth/config');
    if (!config.google) throw new Error('Login Google não configurado. Use e-mail e senha.');
    location.assign('/api/auth/google/start');
  },
  async logout() { await request('/auth/logout', 'POST', {}); currentUid = null; await authCallback(null); },
  profile: () => request('/profile'),
  observeManagements: (uid, callback, onError) => observe('/managements', callback, onError),
  createManagement: data => request('/managements', 'POST', data),
  updateManagement: (id, data) => request(managementPath(id), 'PATCH', data),
  deleteManagement: id => request(managementPath(id), 'DELETE'),
  setMonthlyExpenseLimit: (id, month, amount) => request(`${managementPath(id)}/limit`, 'PUT', { month, amount }),
  setCashPlanning: (id, data) => request(`${managementPath(id)}/cash-planning`, 'PUT', data),
  pushConfig: () => request('/push/config'),
  setPushSettings: (id, data) => request(`${managementPath(id)}/push-settings`, 'PUT', data),
  subscribePush: (id, subscription) => request(`${managementPath(id)}/push-subscriptions`, 'POST', subscription),
  observeTransactions: (id, callback, onError) => observe(recordsPath(id, 'transactions'), callback, onError),
  observeCards: (id, callback, onError) => observe(recordsPath(id, 'cards'), callback, onError),
  saveCard: (mid, data, uid, id) => request(recordsPath(mid, 'cards', id), id ? 'PATCH' : 'POST', data),
  setCardActive: (mid, id, active) => request(recordsPath(mid, 'cards', id), 'PATCH', { active }),
  saveTransaction: (mid, data, uid, id) => request(recordsPath(mid, 'transactions', id), id ? 'PATCH' : 'POST', data),
  deleteTransaction: (mid, id) => request(recordsPath(mid, 'transactions', id), 'DELETE'),
  saveRecurringTransactions: (mid, data, uid, months, recurrenceType = 'fixed') => request(`${recordsPath(mid, 'transactions')}/recurring`, 'POST', { data, months, recurrenceType }),
  updateRecurringTransactions: (mid, item, data, uid, scope) => request(`${recordsPath(mid, 'transactions', item.id)}/series`, 'PATCH', { data, scope }),
  deleteRecurringTransactions: (mid, item, scope) => request(`${recordsPath(mid, 'transactions', item.id)}/series`, 'DELETE', { scope }),
  uploadAttachment: (mid, file) => request(`${managementPath(mid)}/attachments`, 'POST', file, { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }),
  deleteAttachment: path => path ? request(`/attachments/${encodeURIComponent(path)}`, 'DELETE') : Promise.resolve(),
  createManagedUser: data => request('/users', 'POST', data),
  shareManagement: ({ managementId, email, role = 'editor' }) => request(`${managementPath(managementId)}/share`, 'POST', { email, role }),
  observeUsers: (callback, onError) => observe('/users', callback, onError),
  setUserAccess: (uid, data) => request(`/users/${encodeURIComponent(uid)}`, 'PATCH', data)
};
