/* "Save for later" drafts. Deliberately in localStorage, not sessionStorage —
   these must survive closing the tab/browser and starting a new proposal,
   and are never removed automatically (not even after a proposal is
   generated from one) — only an explicit Delete in the Pending tab removes
   an entry. */

const PENDING_KEY = 'satsang_pending_sessions_v1';

function loadPendingSessions() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Could not read pending sessions', e);
    return [];
  }
}

function savePendingSessions(list) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Could not save pending sessions', e);
  }
}

function addPendingSession(record) {
  const list = loadPendingSessions();
  list.unshift(record);
  savePendingSessions(list);
}

function updatePendingSession(id, patch) {
  const list = loadPendingSessions();
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return false;
  list[idx] = Object.assign({}, list[idx], patch, { id });
  savePendingSessions(list);
  return true;
}

function deletePendingSession(id) {
  const list = loadPendingSessions().filter(r => r.id !== id);
  savePendingSessions(list);
}
