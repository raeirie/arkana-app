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
    body: JSON.stringify({ ...payload, user: getUser().id })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'API error');
  return data;
}

// ─────────────────────────────────────────
// CACHE
// TTL-based. Each cache key stores { data, savedAt }.
// Default TTL: 5 minutes — balances freshness vs speed.
// stale-while-revalidate: UI shows cached data instantly,
// background fetch updates cache silently.
// ─────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function saveToCache(db, key) {
  const cacheKey = key
    ? STORAGE_KEY.CACHE + '_' + key
    : STORAGE_KEY.CACHE;
  localStorage.setItem(cacheKey, JSON.stringify({
    data:    db,
    savedAt: Date.now()
  }));
}

function loadFromCache(key) {
  const cacheKey = key
    ? STORAGE_KEY.CACHE + '_' + key
    : STORAGE_KEY.CACHE;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    const age = Date.now() - savedAt;
    // Return data regardless of age — caller decides what to do.
    // isFresh flag lets caller decide whether to refetch.
    return { data, isFresh: age < CACHE_TTL_MS, age };
  } catch {
    return null;
  }
}

function clearCache(key) {
  if (key) {
    localStorage.removeItem(STORAGE_KEY.CACHE + '_' + key);
  } else {
    localStorage.removeItem(STORAGE_KEY.CACHE);
  }
}

// Stale-while-revalidate loader.
// - Shows cached data instantly via onData(data, isStale).
// - If stale or no cache, fetches in background and calls onData again with fresh data.
// - onError called only if no cache AND fetch fails.
async function loadWithCache(action, payload = {}, cacheKey, onData, onError) {
  const cached = loadFromCache(cacheKey);

  if (cached) {
    onData(cached.data, !cached.isFresh);
    if (cached.isFresh) return; // Fresh — no need to refetch
  }

  // No cache or stale — fetch from API
  try {
    const result = await api(action, payload);
    saveToCache(result, cacheKey);
    onData(result, false);
  } catch (err) {
    if (!cached) onError(err); // Only surface error if nothing to show
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

// ─────────────────────────────────────────
// PULL TO REFRESH
// Attach to any scrollable element.
// onRefresh: async function called when user pulls down.
// Usage: initPullToRefresh(document.getElementById('my-list'), async () => { await fetchData(); })
// ─────────────────────────────────────────

function initPullToRefresh(scrollEl, onRefresh) {
  const THRESHOLD = 72;   // px to pull before triggering
  const MAX_PULL  = 96;   // max visual pull distance

  let startY    = 0;
  let pulling   = false;
  let refreshing = false;

  // Create indicator element
  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = '<div class="ptr-spinner"></div><span class="ptr-label">Tarik untuk refresh</span>';
  scrollEl.parentElement.insertBefore(indicator, scrollEl);

  function _setIndicator(pull) {
    const progress = Math.min(pull / THRESHOLD, 1);
    indicator.style.height = Math.min(pull * 0.6, MAX_PULL * 0.6) + 'px';
    indicator.style.opacity = progress;
    indicator.querySelector('.ptr-label').textContent =
      pull >= THRESHOLD ? 'Lepaskan untuk refresh' : 'Tarik untuk refresh';
  }

  function _reset() {
    indicator.style.height = '0';
    indicator.style.opacity = '0';
    indicator.querySelector('.ptr-label').textContent = 'Tarik untuk refresh';
    pulling = false;
  }

  scrollEl.addEventListener('touchstart', e => {
    if (scrollEl.scrollTop > 0 || refreshing) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  scrollEl.addEventListener('touchmove', e => {
    if (!pulling || refreshing) return;
    const dist = e.touches[0].clientY - startY;
    if (dist <= 0) { pulling = false; return; }
    _setIndicator(dist);
  }, { passive: true });

  scrollEl.addEventListener('touchend', async e => {
    if (!pulling || refreshing) return;
    const dist = e.changedTouches[0].clientY - startY;
    if (dist < THRESHOLD) { _reset(); return; }

    // Trigger refresh
    refreshing = true;
    indicator.style.height = '48px';
    indicator.style.opacity = '1';
    indicator.querySelector('.ptr-label').textContent = 'Memperbarui...';

    try {
      await onRefresh();
    } finally {
      refreshing = false;
      _reset();
    }
  }, { passive: true });
}
