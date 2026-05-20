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
// CURRENCY INPUT HELPERS
// Frontend display only — data sent to API always uses parseRp().
// ─────────────────────────────────────────

/**
 * Formats a raw number string into "Rp 1.500.000" display format.
 */
function formatRp(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return 'Rp ' + Number(digits).toLocaleString('id-ID');
}

/**
 * Strips "Rp " prefix and thousand separators, returns plain float.
 * Use this before sending any money value to the API.
 */
function parseRp(val) {
  return parseFloat(String(val).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

/**
 * Attaches Rp live-formatting to one or more input elements by ID.
 * Switches input type to 'text' automatically.
 */
function bindRpInputs(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.type = 'text';
    el.inputMode = 'numeric';
    el.addEventListener('input', () => {
      const pos = el.selectionStart;
      const prev = el.value.length;
      el.value = formatRp(el.value);
      // Keep cursor roughly in place after reformatting
      const diff = el.value.length - prev;
      el.setSelectionRange(pos + diff, pos + diff);
    });
    el.addEventListener('focus', () => {
      if (!el.value) el.value = 'Rp ';
    });
    el.addEventListener('blur', () => {
      if (el.value === 'Rp ' || el.value === 'Rp') el.value = '';
    });
  });
}

function updatePinDots(dotsId, len) {
  document.querySelectorAll(`#${dotsId} .pin-dot`).forEach((dot, i) => {
    dot.classList.toggle('filled', i < len);
  });
}

function updateEnterBtn(btnId, len, required = 4) {
  const btn = document.getElementById(btnId);
  if (btn) btn.style.opacity = len >= required ? '1' : '0.4';
}
