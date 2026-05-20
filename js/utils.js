// ═══════════════════════════════════════════════════
// Arkana App — Utils
// Shared formatting & lightweight UI helpers.
// No DOM dependencies except showToast (uses #toast).
// Load order: 3rd (after constants.js)
// ═══════════════════════════════════════════════════

// ─────────────────────────────────────────
// FORMATTING
// ─────────────────────────────────────────

function fmtNum(n) {
  return Number(n).toLocaleString('id-ID');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear().toString().substr(2)} `
       + `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

// Compact date for chart axis labels: "18/05"
function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ─────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────

let _toastTimer = null;

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  if (_toastTimer) clearTimeout(_toastTimer);
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.add('show');
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function showLoading(text = 'Loading...') {
  const el = document.getElementById('loading');
  const textEl = document.getElementById('loading-text');
  if (textEl) textEl.textContent = text;
  if (el) el.classList.add('active');
}

function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.classList.remove('active');
}

function showConfirm(title, msg, onOk) {
  const overlay = document.getElementById('confirm-overlay');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  const btn = document.getElementById('confirm-ok-btn');
  // Clone to remove previous listener
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener('click', () => { closeConfirm(); onOk(); });
  overlay.classList.add('active');
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('active');
}

function clearForm(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// ─────────────────────────────────────────
// PIN DOT HELPERS  (used by index.js)
// ─────────────────────────────────────────

function updatePinDots(dotsId, len) {
  document.querySelectorAll(`#${dotsId} .pin-dot`).forEach((dot, i) => {
    dot.classList.toggle('filled', i < len);
  });
}

function updateEnterBtn(btnId, len, required = 4) {
  const btn = document.getElementById(btnId);
  if (btn) btn.style.opacity = len >= required ? '1' : '0.4';
}
