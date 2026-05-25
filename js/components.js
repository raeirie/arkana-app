// ═══════════════════════════════════════════════════
// Arkana App — Component Library  v1.10.0
// UI.* — pure functions returning HTML strings.
// No DOM access. No side effects. Input in, HTML out.
//
// Load order: 5th (after app.js, before [page].js)
//
// ─────────────────────────────────────────
// COMPONENT CATALOG
// ─────────────────────────────────────────
//
// UI.emptyState(icon, text)
//   Generic empty state panel.
//
// UI.badge.level(level)
//   Supplier level badge (L1/L2/L3/L4/Jasa).
//
// UI.badge.auth()
//   "✓ Authorized" badge.
//
// UI.badge.metode(metode)
//   Expense payment method badge.
//
// UI.badge.status(status)
//   Project status badge (active/closed).
//
// UI.badge.kategori(label)
//   Expense category label badge.
//
// UI.badge.reimburse()
//   Reimburse flag badge.
//
// UI.badge.proyek(label)
//   Project tag badge.
//
// UI.badge.unit(label)
//   Supplier unit bisnis badge.
//
// UI.card.supplier(supplier, countMap)
//   Full supplier list card HTML.
//
// UI.card.expense(expense, projects)
//   Expense list card HTML.
//
// UI.card.project(project)
//   Project list card HTML.
//
// ═══════════════════════════════════════════════════

const UI = (() => {

  // ─────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────

  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtNum(n) {
    return Number(n).toLocaleString('id-ID');
  }

  function _fmtDate(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    const days   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function _fmtRp(val) {
    return 'Rp ' + (parseFloat(val) || 0).toLocaleString('id-ID');
  }

  // ─────────────────────────────────────────
  // UI.emptyState
  // ─────────────────────────────────────────

  /**
   * Generic empty state panel.
   * @param {string} icon  — Emoji icon
   * @param {string} text  — Message text (may contain <br>)
   * @returns {string} HTML
   */
  function emptyState(icon, text) {
    return `<div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <div class="empty-text">${text}</div>
    </div>`;
  }

  // ─────────────────────────────────────────
  // UI.badge.*
  // All badge functions return inline HTML strings.
  // ─────────────────────────────────────────

  const badge = {

    /**
     * Supplier level badge.
     * @param {string} level  — 'L1' | 'L2' | 'L3' | 'L4' | 'Jasa'
     */
    level(level) {
      const isJasa = level === 'Jasa';
      const cls = isJasa ? 'jasa' : level.toLowerCase();
      const label = isJasa ? '🔧 Jasa' : level;
      return `<span class="level-badge ${cls}">${label}</span>`;
    },

    /** "✓ Authorized" green badge */
    auth() {
      return `<span class="auth-badge">✓ Authorized</span>`;
    },

    /**
     * Expense payment method badge.
     * @param {string} metode  — METODE_BAYAR constant value
     */
    metode(metode) {
      if (metode === 'kas_perusahaan')
        return `<span class="badge badge-kas">🏦 Kas Perusahaan</span>`;
      if (metode === 'personal')
        return `<span class="badge badge-personal">👤 Personal</span>`;
      if (metode === 'vendor_paylater')
        return `<span class="badge badge-paylater">⏳ Vendor Paylater</span>`;
      return '';
    },

    /**
     * Project status badge.
     * @param {string} status  — 'active' | 'closed'
     */
    status(status) {
      const isActive = status === 'active';
      const cls   = isActive ? 'status-active' : 'status-closed';
      const label = isActive ? 'Aktif' : 'Selesai';
      return `<span class="status-badge ${cls}">${label}</span>`;
    },

    /**
     * Expense category badge.
     * @param {string} label
     */
    kategori(label) {
      return `<span class="badge badge-kategori">${_esc(label)}</span>`;
    },

    /** Reimburse flag badge */
    reimburse() {
      return `<span class="badge badge-reimburse">↩ Reimburse</span>`;
    },

    /**
     * Project tag badge on expense cards.
     * @param {string} label  — Project name or fallback
     */
    proyek(label) {
      return `<span class="badge badge-proyek">📁 ${_esc(label)}</span>`;
    },

    /**
     * Unit bisnis badge on supplier cards.
     * @param {string} label
     */
    unit(label) {
      return `<span class="unit-badge">${_esc(label)}</span>`;
    }

  };

  // ─────────────────────────────────────────
  // UI.card.*
  // Full card HTML for list rendering.
  // ─────────────────────────────────────────

  const card = {

    /**
     * Supplier list card.
     * @param {object} supplier  — Supplier record from DB
     * @param {object} countMap  — { [supplierId]: { produk: n, jasa: n } }
     * @returns {string} HTML
     */
    supplier(supplier, countMap = {}) {
      const s        = supplier;
      const initials = s.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      const color    = SUPPLIER_COLORS[s.name.charCodeAt(0) % SUPPLIER_COLORS.length];
      const phone    = s.kontak ? String(s.kontak) : '—';
      const counts   = countMap[s.id] || { produk: 0, jasa: 0 };
      const isJasa   = s.level === SUPPLIER_LEVEL.JASA;

      const countChips = [
        counts.produk > 0 ? `<span class="count-chip count-produk">📦 ${counts.produk} produk</span>` : '',
        counts.jasa   > 0 ? `<span class="count-chip count-jasa">🔧 ${counts.jasa} jasa</span>` : ''
      ].filter(Boolean).join('');

      const units = (s.units || []).map(u => badge.unit(u)).join('');

      return `<div class="supplier-card js-open-supplier" data-id="${s.id}">
        <div class="supplier-card-top">
          <div class="supplier-initial" style="background:${color}">${initials}</div>
          <div class="supplier-info">
            <div class="supplier-name">${_esc(s.name)}</div>
            <div class="supplier-meta">${_esc(phone)}${s.kota ? ' · ' + _esc(s.kota) : ''}</div>
          </div>
        </div>
        <div class="supplier-badges">
          ${badge.level(s.level)}
          ${s.authorized && !isJasa ? badge.auth() : ''}
          ${units}
        </div>
        ${countChips ? `<div class="supplier-count-chips">${countChips}</div>` : ''}
      </div>`;
    },

    /**
     * Expense list card.
     * @param {object} expense   — Expense record
     * @param {Array}  projects  — Projects array for name lookup
     * @returns {string} HTML
     */
    expense(expense, projects = []) {
      const e = expense;

      const proj = e.tipe === 'proyek'
        ? projects.find(p => p.id === e.projectId)
        : null;

      const kategoriLabel = (e.kategori === 'Lain-lain' && e.customKategori)
        ? _esc(e.customKategori)
        : _esc(e.kategori || '—');

      const reimburseTag = (
        e.metodePembayaran === 'personal' &&
        e.perluReimburse === 'ya'
      ) ? badge.reimburse() : '';

      const proyekTag = proj
        ? badge.proyek(proj.nama)
        : (e.tipe === 'proyek' ? badge.proyek('Proyek') : '');

      return `<div class="expense-card" data-id="${e.id}">
        <div class="card-top">
          <div class="card-left">
            <div class="card-desc">${_esc(e.deskripsi || '(tanpa deskripsi)')}</div>
            <div class="card-date">${_fmtDate(e.tanggal)}</div>
          </div>
          <div class="card-amount">${_fmtRp(e.jumlah)}</div>
        </div>
        <div class="card-bottom">
          ${badge.kategori(kategoriLabel)}
          ${badge.metode(e.metodePembayaran)}
          ${reimburseTag}
          ${proyekTag}
        </div>
      </div>`;
    },

    /**
     * Project list card.
     * @param {object} project  — Project record
     * @returns {string} HTML
     */
    project(project) {
      const p = project;
      const isClosed = p.status === 'closed';

      return `<div class="project-card ${isClosed ? 'closed' : ''}" data-id="${p.id}">
        <div class="card-stripe"></div>
        <div class="card-body">
          <div class="card-name">${_esc(p.nama)}</div>
          <div class="card-meta">
            <span class="card-unit">${_esc(p.unitBisnis || '—')}</span>
            ${badge.status(p.status)}
          </div>
        </div>
        <div class="card-arrow">›</div>
      </div>`;
    }

  };

  // ─────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────
  return { emptyState, badge, card };

})();
