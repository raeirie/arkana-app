// ═══════════════════════════════════════════════════
// Arkana App — App Core
// Shared: API layer, session, cache, activity log,
// and the USERS registry.
// Load order: 4th (after utils.js)
// ═══════════════════════════════════════════════════

// ─────────────────────────────────────────
// USERS REGISTRY
// Single source of truth for user definitions.
// avatar = initials string (fallback when no photo uploaded).
// color  = gradient string for avatar backgrounds.
// ─────────────────────────────────────────
const USERS = {
  arie: {
    id:     'arie',
    name:   'Arie',
    avatar: 'AR',
    color:  'linear-gradient(135deg,#1D4ED8,#3B82F6)'
  },
  ajin: {
    id:     'ajin',
    name:   'Ajin',
    avatar: 'AJ',
    color:  'linear-gradient(135deg,#065F46,#10B981)'
  }
};

// ─────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY.SESSION)) || {};
  } catch {
    return {};
  }
}

function setSession(userObj) {
  localStorage.setItem(STORAGE_KEY.SESSION, JSON.stringify(userObj));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY.SESSION);
}

// ─────────────────────────────────────────
// API
// Single implementation — used by all pages.
// Action passed as URL query param; payload as POST body.
// ─────────────────────────────────────────

async function api(action, payload = {}) {
  const url = ARKANA_SCRIPT_URL;
  if (!url) throw new Error('Apps Script URL not configured');
  const endpoint = url + '?action=' + encodeURIComponent(action);
  const res = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ ...payload, user: getUser().name })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API error');
  return data;
}

// ─────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────

function saveToCache(db) {
  localStorage.setItem(STORAGE_KEY.CACHE, JSON.stringify(db));
}

function loadFromCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY.CACHE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// ACTIVITY LOG
// Unified signature: (action, detail)
// Gets userId from session internally.
// ─────────────────────────────────────────

function logActivity(action, detail) {
  try {
    const logs = JSON.parse(localStorage.getItem(STORAGE_KEY.LOG) || '[]');
    logs.unshift({
      userId: getUser().id,
      action,
      detail,
      time: new Date().toISOString()
    });
    if (logs.length > 200) logs.pop();
    localStorage.setItem(STORAGE_KEY.LOG, JSON.stringify(logs));
  } catch (e) {
    console.warn('[logActivity] localStorage error:', e);
  }
  // Best-effort sync to sheet — never blocks UI
  if (ARKANA_SCRIPT_URL) {
    api('addLog', { action, detail }).catch(() => {});
  }
}

function getActivityLog() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY.LOG) || '[]');
  } catch {
    return [];
  }
}
