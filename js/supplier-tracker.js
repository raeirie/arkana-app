// ═══════════════════════════════════════════════════
// Arkana App — Supplier Tracker Module
// Namespace: SupplierTracker
// Depends on: config.js, constants.js, utils.js, app.js
// Load order: 5th
// ═══════════════════════════════════════════════════

const SupplierTracker = (() => {

  // ─────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────
  let currentTab         = TAB.SUPPLIERS;
  let levelFilter        = '';
  let unitFilter         = '';
  let cityFilter         = '';
  let currentSupplierId  = null;
  let currentProductId   = null;
  let currentJasaId      = null;
  let editMode           = false;
  let jasaEditMode       = false;   // true = saveJasa() routes to saveJasaEdit()
  let priceEntryProductId = null;
  let updatePriceEntryId  = null;
  let updatePriceProductId = null;

  let DB = { suppliers: [], products: [], priceEntries: [], units: [] };

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────
  function init() {
    const user = getUser();
    if (!user.id) { window.location.href = 'index.html'; return; }

    document.getElementById('topbar-user').textContent = `Login sebagai ${user.name}`;

    const cached = loadFromCache('supplier');
    if (cached) DB = cached.data || cached;
    renderAll();

    if (ARKANA_SCRIPT_URL) fetchAll();

    _bindEvents();

    // Pull to refresh — single instance, dynamically resolves active pane.
    // Passing a function instead of a fixed element ensures bounds check
    // always uses the currently visible pane, not a stale reference.
    // Fixes: 4 conflicting touch listeners on the same parent (v1.8.0).
    const _paneMap = {
      [TAB.SUPPLIERS]: 'pane-suppliers',
      [TAB.PRODUCTS]:  'pane-products',
      [TAB.JASA]:      'pane-jasa',
      [TAB.COMPARE]:   'pane-compare'
    };
    const _doRefresh = async () => {
      clearCache('supplier');
      await fetchAll();
    };
    initPullToRefresh(
      () => document.getElementById(_paneMap[currentTab] || 'pane-suppliers'),
      _doRefresh
    );
  }

  // ─────────────────────────────────────────
  // API / DATA
  // ─────────────────────────────────────────
  async function fetchAll() {
    try {
      const data = await api('getAll');
      DB = data.db;
      saveToCache(DB, 'supplier');
      renderAll();
    } catch (e) {
      showToast('Gagal memuat data: ' + e.message, 'error');
    }
  }

  // ─────────────────────────────────────────
  // DATA HELPERS
  // Reusable across modules — pure functions over DB.
  // ─────────────────────────────────────────

  /**
   * Returns ONE active PriceEntry per supplier for a given productId.
   * "Active" = the entry with the most recent updatedAt for that supplierId.
   * This is the canonical source of truth for current prices.
   */
  function latestPricePerSupplier(productId) {
    const map = {};
    DB.priceEntries.forEach(e => {
      if (e.productId !== productId) return;
      const existing = map[e.supplierId];
      if (!existing || new Date(e.updatedAt) > new Date(existing.updatedAt)) {
        map[e.supplierId] = e;
      }
    });
    return Object.values(map);
  }

  /**
   * Returns ALL PriceEntries for a productId + supplierId, sorted newest-first.
   */
  function priceHistoryForSupplier(productId, supplierId) {
    return DB.priceEntries
      .filter(e => e.productId === productId && e.supplierId === supplierId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  /**
   * Returns trend direction from two most recent history entries.
   * Returns: 'up' | 'down' | 'stable' | null
   */
  function getTrend(history) {
    if (!history || history.length < 2) return null;
    const latest = parseFloat(history[0].harga);
    const prev   = parseFloat(history[1].harga);
    if (latest > prev) return 'up';
    if (latest < prev) return 'down';
    return 'stable';
  }

  // ─────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────

  function renderTrendBadge(trend) {
    if (!trend) return '';
    const map = {
      up:     { cls: 'trend-up',     icon: '↑', label: 'Naik' },
      down:   { cls: 'trend-down',   icon: '↓', label: 'Turun' },
      stable: { cls: 'trend-stable', icon: '→', label: 'Stabil' }
    };
    const t = map[trend];
    return `<span class="trend-badge ${t.cls}">${t.icon} ${t.label}</span>`;
  }

  /**
   * Renders expandable history timeline panel for one supplier row.
   * History entries carry data-* attrs so delete is handled by delegation.
   */
  function renderHistoryTimeline(panelId, history, productId, isJasa) {
    if (history.length < 2) return '';
    const rows = history.map((e, idx) => {
      const isLatest = idx === 0;
      const jasaStyle = isJasa
        ? 'border-color:rgba(139,92,246,.3);color:var(--purple)'
        : '';
      return `
      <div class="history-row${isLatest ? ' latest' : ''}">
        <div class="history-row-price">
          Rp ${fmtNum(e.harga)}
          ${isLatest
            ? `<span class="history-latest-tag" style="${jasaStyle}">Terkini</span>`
            : ''}
        </div>
        <div class="history-row-meta">${fmtDate(e.updatedAt)}<br>${e.updatedBy || '—'}</div>
        ${!isLatest
          ? `<span class="history-del js-del-price"
               data-price-id="${e.id}"
               data-product-id="${productId}">✕</span>`
          : ''}
      </div>`;
    }).join('');

    return `
    <div class="history-timeline" id="${panelId}">
      <div style="padding:10px 12px 0;">${renderPriceChart(history)}</div>
      ${rows}
    </div>`;
  }

  /**
   * Inline SVG line chart from history array (newest-first input).
   * Returns empty string if fewer than 2 entries.
   */
  function renderPriceChart(history) {
    if (!history || history.length < 2) return '';
    const chrono = [...history].reverse();
    const prices = chrono.map(e => parseFloat(e.harga));
    const dates  = chrono.map(e => fmtDateShort(e.updatedAt));

    const W = 400, H = 80, padX = 28, padY = 14;
    const chartW = W - padX * 2;
    const chartH = H - padY * 2;
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;

    const toY = p => padY + chartH - ((p - minP) / range) * chartH;
    const toX = i => padX + (i / (chrono.length - 1)) * chartW;

    const points = chrono.map((_, i) => `${toX(i)},${toY(prices[i])}`).join(' ');
    const areaPath = `M ${points.split(' ').join(' L ')} `
      + `L ${toX(chrono.length - 1)},${H - padY + 4} L ${toX(0)},${H - padY + 4} Z`;

    const dots = chrono.map((_, i) => {
      const isLatest = i === chrono.length - 1;
      return isLatest
        ? `<circle cx="${toX(i)}" cy="${toY(prices[i])}" r="4.5" fill="var(--accent)"/>`
        : `<circle cx="${toX(i)}" cy="${toY(prices[i])}" r="3" fill="var(--surface2)" stroke="var(--border2)" stroke-width="1.5"/>`;
    }).join('');

    const labelIndices = chrono.length <= 3 ? chrono.map((_, i) => i) : [0, chrono.length - 1];
    const labels = labelIndices.map(i => {
      const anchor = i === 0 ? 'start' : i === chrono.length - 1 ? 'end' : 'middle';
      return `<text x="${toX(i)}" y="${H}" text-anchor="${anchor}"
        font-size="8" fill="var(--muted)"
        font-family="'JetBrains Mono',monospace">${dates[i]}</text>`;
    }).join('');

    const gradId = `cg${Math.random().toString(36).slice(2, 7)}`;

    return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
      style="width:100%;height:auto;display:block;margin-bottom:10px;overflow:visible;">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})"/>
      <polyline points="${points}" fill="none" stroke="var(--accent)"
        stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${labels}
    </svg>`;
  }

  function _toggleHistory(panelId, toggleEl) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    if (toggleEl) {
      toggleEl.textContent = isOpen
        ? '▲ Sembunyikan'
        : `▼ ${panel.querySelectorAll('.history-row').length} riwayat`;
    }
  }

  // ─────────────────────────────────────────
  // RENDER — ALL
  // ─────────────────────────────────────────
  function renderAll() {
    try { renderSuppliers(); }  catch (e) { console.error('[renderSuppliers]', e); }
    try { renderProducts(); }   catch (e) { console.error('[renderProducts]', e); }
    if (currentTab === TAB.JASA) {
      try { renderJasa(); }     catch (e) { console.error('[renderJasa]', e); }
    }
    try { renderCompare(); }    catch (e) { console.error('[renderCompare]', e); }
    try { renderUnitChips(); }  catch (e) { console.error('[renderUnitChips]', e); }
    try { populateSupplierDropdowns(); } catch (e) { console.error('[populateDropdowns]', e); }
  }

  // ─────────────────────────────────────────
  // RENDER — SUPPLIERS
  // ─────────────────────────────────────────
  function renderSuppliers() {
    const q = document.getElementById('search-suppliers').value.toLowerCase();

    let list = DB.suppliers.filter(s =>
      (!levelFilter || s.level === levelFilter) &&
      (!unitFilter  || (s.units || []).includes(unitFilter)) &&
      (!cityFilter  || (s.kota  || '').toLowerCase() === cityFilter.toLowerCase()) &&
      (!q || s.name.toLowerCase().includes(q) || (s.kota || '').toLowerCase().includes(q))
    );
    list.sort((a, b) => a.name.localeCompare(b.name, 'id'));

    // Stats bar
    const total    = DB.suppliers.length;
    const cities   = [...new Set(DB.suppliers.map(s => s.kota).filter(Boolean))].length;
    document.getElementById('supplier-stats').innerHTML = `
      <div class="stat-chip">Total: <span>${total}</span></div>
      ${list.length !== total ? `<div class="stat-chip">Filter: <span>${list.length}</span></div>` : ''}
      <div class="stat-chip">Kota: <span>${cities}</span></div>`;

    // Unit bisnis filter chips
    const allUnits = [...new Set(DB.suppliers.flatMap(s => s.units || []))].sort();
    document.getElementById('filter-unit').innerHTML = allUnits.length
      ? `<div class="chip ${!unitFilter ? 'active' : ''}" data-unit="">Semua Unit</div>`
        + allUnits.map(u =>
            `<div class="chip ${unitFilter === u ? 'active' : ''}" data-unit="${u}">${u}</div>`
          ).join('')
      : '';

    // City filter chips
    const preCity = DB.suppliers.filter(s =>
      (!levelFilter || s.level === levelFilter) &&
      (!unitFilter  || (s.units || []).includes(unitFilter))
    );
    const allCities = [...new Set(preCity.map(s => s.kota).filter(Boolean))].sort();
    document.getElementById('filter-city').innerHTML = allCities.length
      ? `<div class="chip ${!cityFilter ? 'active' : ''}" data-city="">Semua Kota</div>`
        + allCities.map(c => {
            const count = preCity.filter(s => s.kota === c).length;
            return `<div class="chip ${cityFilter === c ? 'active' : ''}" data-city="${c}">${c} (${count})</div>`;
          }).join('')
      : '';

    const el = document.getElementById('list-suppliers');
    if (!list.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">🏪</div>
        <div class="empty-text">Belum ada supplier.<br>Tap + untuk tambah supplier baru.</div>
      </div>`;
      return;
    }

    // Build supplier→count map once (O(products))
    const countMap = {};
    DB.products.forEach(p => {
      latestPricePerSupplier(p.id).forEach(e => {
        if (!countMap[e.supplierId]) countMap[e.supplierId] = { produk: 0, jasa: 0 };
        if (p.type === ITEM_TYPE.JASA) countMap[e.supplierId].jasa++;
        else countMap[e.supplierId].produk++;
      });
    });

    el.innerHTML = list.map(s => {
      const initials = s.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      const color    = SUPPLIER_COLORS[s.name.charCodeAt(0) % SUPPLIER_COLORS.length];
      const phone    = s.kontak ? String(s.kontak) : '—';
      const counts   = countMap[s.id] || { produk: 0, jasa: 0 };
      const chips    = [
        counts.produk > 0
          ? `<span class="count-chip count-produk">📦 ${counts.produk} produk</span>` : '',
        counts.jasa > 0
          ? `<span class="count-chip count-jasa">🔧 ${counts.jasa} jasa</span>` : ''
      ].filter(Boolean).join('');
      const isJasaLevel = s.level === SUPPLIER_LEVEL.JASA;
      return `
      <div class="supplier-card js-open-supplier" data-id="${s.id}">
        <div class="supplier-card-top">
          <div class="supplier-initial" style="background:${color}">${initials}</div>
          <div class="supplier-info">
            <div class="supplier-name">${s.name}</div>
            <div class="supplier-meta">${phone}${s.kota ? ' · ' + s.kota : ''}</div>
          </div>
        </div>
        <div class="supplier-badges">
          <span class="level-badge ${isJasaLevel ? 'jasa' : s.level.toLowerCase()}">
            ${isJasaLevel ? '🔧 Jasa' : s.level}
          </span>
          ${s.authorized && !isJasaLevel ? '<span class="auth-badge">✓ Authorized</span>' : ''}
          ${(s.units || []).map(u => `<span class="unit-badge">${u}</span>`).join('')}
        </div>
        ${chips ? `<div class="supplier-count-chips">${chips}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ─────────────────────────────────────────
  // RENDER — PRODUCTS
  // ─────────────────────────────────────────
  function renderProducts() {
    const q = document.getElementById('search-products').value.toLowerCase();
    const all = DB.products.filter(p => p.type !== ITEM_TYPE.JASA);
    const list = all.filter(p =>
      !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
    );
    const stats = `<div class="stats-bar">
      <div class="stat-chip">Total: <span>${all.length}</span></div>
      ${q && list.length !== all.length ? `<div class="stat-chip">Filter: <span>${list.length}</span></div>` : ''}
    </div>`;
    const el = document.getElementById('list-products');
    el.innerHTML = !list.length
      ? stats + `<div class="empty-state">
          <div class="empty-icon">📦</div>
          <div class="empty-text">Belum ada produk.<br>Tap + untuk tambah produk baru.</div>
        </div>`
      : stats + list.map(p => renderItemCard(p)).join('');
  }

  // ─────────────────────────────────────────
  // RENDER — JASA
  // ─────────────────────────────────────────
  function renderJasa() {
    const q  = (document.getElementById('search-jasa')?.value || '').toLowerCase();
    const el = document.getElementById('list-jasa');
    if (!el) return;
    const all  = DB.products.filter(p => p.type === ITEM_TYPE.JASA);
    const list = all.filter(p =>
      !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
    ).sort((a, b) => a.name.localeCompare(b.name, 'id'));
    const stats = `<div class="stats-bar">
      <div class="stat-chip">Total: <span>${all.length}</span></div>
      ${q && list.length !== all.length ? `<div class="stat-chip">Filter: <span>${list.length}</span></div>` : ''}
    </div>`;
    el.innerHTML = !list.length
      ? stats + `<div class="empty-state">
          <div class="empty-icon">🔧</div>
          <div class="empty-text">Belum ada layanan jasa.<br>Tap + untuk tambah jasa baru.</div>
        </div>`
      : stats + list.map(p => renderItemCard(p)).join('');
  }

  // ─────────────────────────────────────────
  // RENDER — ITEM CARD (shared Produk & Jasa)
  // ─────────────────────────────────────────
  function renderItemCard(p) {
    const isJasa        = p.type === ITEM_TYPE.JASA;
    const activeEntries = latestPricePerSupplier(p.id);
    const bestPrice     = activeEntries.length
      ? Math.min(...activeEntries.map(e => parseFloat(e.harga))) : null;
    const bestEntry     = activeEntries.find(e => parseFloat(e.harga) === bestPrice);
    const bestHistory   = bestEntry ? priceHistoryForSupplier(p.id, bestEntry.supplierId) : [];
    const trend         = getTrend(bestHistory);
    const accentColor   = isJasa ? 'var(--purple)' : 'var(--green)';
    const satuan        = p.satuan || (isJasa ? 'per project' : 'pcs');
    const action        = isJasa ? 'open-jasa-detail' : 'open-product-detail';
    const latestUpdate  = [...activeEntries].sort((a, b) =>
      new Date(b.updatedAt) - new Date(a.updatedAt))[0];

    return `
    <div class="product-card js-item-card" data-action="${action}" data-id="${p.id}">
      <div class="product-header">
        <div class="product-name">${p.name}</div>
        <div class="product-category">${p.category || '—'}</div>
      </div>
      <div class="product-price-row">
        <div class="product-best-price" style="color:${bestPrice ? accentColor : 'var(--text3)'}">
          ${bestPrice
            ? `Rp ${fmtNum(bestPrice)}<span style="font-size:10px;font-weight:400;color:var(--muted)"> /${satuan}</span>`
            : 'Belum ada harga'}
          ${trend ? ' ' + renderTrendBadge(trend) : ''}
        </div>
        <div class="product-supplier-count">${activeEntries.length} supplier</div>
      </div>
      ${latestUpdate
        ? `<div class="product-updated">Update: ${fmtDate(latestUpdate.updatedAt)} · ${latestUpdate.updatedBy}</div>`
        : ''}
    </div>`;
  }

  // ─────────────────────────────────────────
  // RENDER — COMPARE
  // ─────────────────────────────────────────
  function renderCompare() {
    const q = document.getElementById('search-compare').value.toLowerCase();
    const allWithEntries = DB.products.filter(p => {
      const hasEntries = latestPricePerSupplier(p.id).length > 0;
      return hasEntries && (!q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
    });
    const el = document.getElementById('list-compare');
    if (!allWithEntries.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">⚖️</div>
        <div class="empty-text">Belum ada data harga untuk dibandingkan.<br>
        Tambah produk atau jasa + harga dari tab Produk / Jasa.</div>
      </div>`;
      return;
    }

    const produkList = allWithEntries.filter(p => p.type !== ITEM_TYPE.JASA);
    const jasaList   = allWithEntries.filter(p => p.type === ITEM_TYPE.JASA);
    let html = '';

    const renderCompareCard = p => {
      const isJasa  = p.type === ITEM_TYPE.JASA;
      const entries = latestPricePerSupplier(p.id).sort((a, b) =>
        parseFloat(a.harga) - parseFloat(b.harga));
      const bestPrice      = entries[0] ? parseFloat(entries[0].harga) : null;
      const accentColor    = isJasa ? 'var(--purple)' : 'var(--green)';
      const bestLabelBg    = isJasa ? 'rgba(139,92,246,.12)' : 'rgba(16,185,129,.12)';
      const bestLabelColor = isJasa ? 'var(--purple)'        : 'var(--green)';
      const action         = isJasa ? 'open-jasa-detail'     : 'open-product-detail';
      const typeBg    = isJasa ? 'rgba(139,92,246,.1)' : 'rgba(59,130,246,.1)';
      const typeColor = isJasa ? 'var(--purple)'       : 'var(--accent)';
      const typeBorder = isJasa ? 'rgba(139,92,246,.2)' : 'rgba(59,130,246,.2)';

      const rows = entries.map(e => {
        const sup    = DB.suppliers.find(s => s.id === e.supplierId);
        const isBest = parseFloat(e.harga) === bestPrice;
        const history = priceHistoryForSupplier(p.id, e.supplierId);
        const trend   = getTrend(history);
        const isJasaLevel = sup?.level === SUPPLIER_LEVEL.JASA;
        const rowBorderColor = isBest ? accentColor : '';
        const rowBg  = isBest ? (isJasa ? 'rgba(139,92,246,.05)' : 'rgba(16,185,129,.05)') : '';
        return `
        <div class="compare-row${isBest ? ' best' : ''}"
          style="${rowBorderColor ? 'border-color:' + rowBorderColor + ';' : ''}${rowBg ? 'background:' + rowBg + ';' : ''}">
          <span class="level-badge ${isJasaLevel ? 'jasa' : (sup?.level || '').toLowerCase()}" style="flex-shrink:0">
            ${isJasaLevel ? '🔧' : (sup?.level || '?')}
          </span>
          <span class="compare-supplier-name">${sup?.name || '?'}</span>
          ${trend ? renderTrendBadge(trend) : ''}
          <span class="compare-price" style="${isBest ? 'color:' + accentColor : ''}">
            Rp ${fmtNum(e.harga)}
          </span>
          ${isBest
            ? `<span class="best-label" style="background:${bestLabelBg};color:${bestLabelColor}">Terbaik</span>`
            : ''}
        </div>`;
      }).join('');

      return `
      <div class="compare-card js-item-card" data-action="${action}" data-id="${p.id}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
          <div class="compare-name">${p.name}</div>
          <span style="font-family:'JetBrains Mono',monospace;font-size:9px;padding:2px 7px;
            border-radius:10px;background:${typeBg};color:${typeColor};
            border:1px solid ${typeBorder};white-space:nowrap;flex-shrink:0;margin-left:8px;">
            ${isJasa ? '🔧 Jasa' : '📦 Produk'}
          </span>
        </div>
        <div class="compare-cat">${p.category || ''} · ${p.satuan || 'pcs'}</div>
        <div class="compare-suppliers" style="margin-top:10px;">${rows}</div>
      </div>`;
    };

    if (produkList.length) {
      html += `<div class="section-label">📦 Produk (${produkList.length})</div>`;
      html += produkList.map(p => renderCompareCard(p)).join('');
    }
    if (jasaList.length) {
      html += `<div class="section-label" style="margin-top:${produkList.length ? '20px' : '4px'}">
        🔧 Jasa (${jasaList.length})</div>`;
      html += jasaList.map(p => renderCompareCard(p)).join('');
    }
    el.innerHTML = html;
  }

  // ─────────────────────────────────────────
  // RENDER — UNIT CHIPS (form)
  // ─────────────────────────────────────────
  function renderUnitChips() {
    const el = document.getElementById('f-supplier-units');
    if (!el) return;
    el.innerHTML = DB.units.map(u =>
      `<div class="multi-chip js-toggle-chip">${u}</div>`
    ).join('');
  }

  function populateSupplierDropdowns() {
    const opts = '<option value="">Pilih supplier...</option>'
      + DB.suppliers.map(s => `<option value="${s.id}">${s.name} (${s.level})</option>`).join('');
    ['f-price-supplier', 'f-pe-supplier', 'f-jasa-supplier'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = opts;
    });
  }

  // ─────────────────────────────────────────
  // SCREEN NAVIGATION
  // ─────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function goBack(screenId) {
    showScreen(screenId);
    renderAll();
  }

  function switchTab(tab) {
    currentTab = tab;
    Object.values(TAB).forEach(t => {
      document.getElementById('tab-' + t).classList.toggle('active', t === tab);
      document.getElementById('pane-' + t).style.display = t === tab ? '' : 'none';
    });
    document.getElementById('fab-btn').style.display = tab === TAB.COMPARE ? 'none' : '';
    if (tab === TAB.JASA) renderJasa();
  }

  // ─────────────────────────────────────────
  // SHEET HELPERS
  // ─────────────────────────────────────────
  function openSheet(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSheet(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
  }

  // ─────────────────────────────────────────
  // SUPPLIER DETAIL
  // ─────────────────────────────────────────
  function openSupplierDetail(id) {
    currentSupplierId = id;
    const s = DB.suppliers.find(x => x.id === id);
    if (!s) return;

    document.getElementById('detail-supplier-name').textContent = s.name;
    document.getElementById('detail-supplier-level').textContent = s.level === SUPPLIER_LEVEL.JASA
      ? '🔧 Jasa / Service Provider'
      : `${s.level}${s.authorized ? ' · ✓ Authorized' : ''}`;

    const allActive = DB.products.reduce((acc, prod) => {
      const active = latestPricePerSupplier(prod.id).find(e => e.supplierId === id);
      if (active) acc.push({ product: prod, entry: active });
      return acc;
    }, []);

    const produkEntries = allActive.filter(({ product: p }) => p.type !== ITEM_TYPE.JASA);
    const jasaEntries   = allActive.filter(({ product: p }) => p.type === ITEM_TYPE.JASA);

    const produkCards = produkEntries.map(({ product: p, entry: e }) => `
      <div class="detail-card js-open-product-detail" data-id="${p.id}">
        <div class="price-entry-row">
          <div class="price-entry-name">${p.name || '?'}</div>
          <div class="price-entry-price">Rp ${fmtNum(e.harga)}</div>
        </div>
        <div class="price-entry-meta">${p.category || ''} · ${p.satuan || 'pcs'}</div>
        ${e.moq ? `<div class="price-entry-moq">MOQ: ${e.moq}</div>` : ''}
        <div class="price-entry-moq">Update: ${fmtDate(e.updatedAt)} · ${e.updatedBy}</div>
      </div>`).join('')
      || '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Belum ada produk.</div>';

    const jasaCards = jasaEntries.map(({ product: p, entry: e }) => `
      <div class="detail-card js-open-jasa-detail" data-id="${p.id}">
        <div class="price-entry-row">
          <div class="price-entry-name">${p.name || '?'}</div>
          <div class="price-entry-price" style="color:var(--purple)">Rp ${fmtNum(e.harga)}</div>
        </div>
        <div class="price-entry-meta">${p.satuan || 'per project'}</div>
        ${e.catatan ? `<div class="price-entry-meta" style="margin-top:2px">${e.catatan}</div>` : ''}
        <div class="price-entry-moq" style="margin-top:4px">Update: ${fmtDate(e.updatedAt)} · ${e.updatedBy}</div>
      </div>`).join('')
      || '<div style="font-size:12px;color:var(--text3);padding:8px 0;">Belum ada layanan jasa.</div>';

    document.getElementById('supplier-detail-content').innerHTML = `
      <div class="detail-section">
        <div class="detail-section-title">Informasi Supplier</div>
        <div class="detail-card">
          <div class="detail-field"><div class="detail-field-label">Kontak</div>
            <div class="detail-field-value">${s.kontak ? String(s.kontak) : '—'}</div></div>
          <div class="detail-field"><div class="detail-field-label">Kota</div>
            <div class="detail-field-value">${s.kota || '—'}</div></div>
          <div class="detail-field"><div class="detail-field-label">Unit Bisnis</div>
            <div class="detail-field-value">${(s.units || []).join(', ') || '—'}</div></div>
          ${s.catatan ? `<div class="detail-field"><div class="detail-field-label">Catatan</div>
            <div class="detail-field-value">${s.catatan}</div></div>` : ''}
          <div class="detail-field"><div class="detail-field-label">Ditambahkan oleh</div>
            <div class="detail-field-value">${s.createdBy || '—'} · ${fmtDate(s.createdAt)}</div></div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>📦 Produk (${produkEntries.length})</span>
          <span class="js-add-price-for-supplier detail-action-btn" data-id="${id}">+</span>
        </div>
        ${produkCards}
      </div>
      <div class="detail-section">
        <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>🔧 Jasa (${jasaEntries.length})</span>
          <span class="js-add-jasa-for-supplier detail-action-btn" style="color:var(--purple)" data-id="${id}">+</span>
        </div>
        ${jasaCards}
      </div>`;

    showScreen(SCREEN.SUPPLIER_DETAIL);
  }

  // ─────────────────────────────────────────
  // PRODUCT DETAIL
  // ─────────────────────────────────────────
  function openProductDetail(id) {
    currentProductId = id;
    const p = DB.products.find(x => x.id === id);
    if (!p) return;
    if (p.type === ITEM_TYPE.JASA) { openJasaDetail(id); return; }

    document.getElementById('detail-product-name').textContent = p.name;
    document.getElementById('detail-product-cat').textContent = `${p.category || ''} · ${p.satuan || 'pcs'}`;

    const activeEntries = latestPricePerSupplier(id).sort((a, b) =>
      parseFloat(a.harga) - parseFloat(b.harga));
    const bestPrice = activeEntries[0] ? parseFloat(activeEntries[0].harga) : null;

    const priceCards = activeEntries.map(e => {
      const s         = DB.suppliers.find(x => x.id === e.supplierId);
      const isBest    = parseFloat(e.harga) === bestPrice;
      const history   = priceHistoryForSupplier(id, e.supplierId);
      const trend     = getTrend(history);
      const panelId   = `hist-panel-${e.supplierId}`;
      const toggleId  = `hist-toggle-${e.supplierId}`;
      const histCount = history.length;
      const isJasaLevel = s?.level === SUPPLIER_LEVEL.JASA;

      return `
      <div class="detail-card js-open-supplier-contact" data-id="${s?.id}">
        <div class="price-entry-row">
          <div>
            <div class="price-entry-name">${s?.name || '?'}
              <span class="level-badge ${isJasaLevel ? 'jasa' : (s?.level || '').toLowerCase()}"
                style="font-size:9px">${s?.level || ''}</span>
            </div>
            ${s?.authorized ? '<div style="font-size:10px;color:var(--green);margin-top:2px;">✓ Authorized</div>' : ''}
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${s?.kota || ''}</div>
          </div>
          <div style="text-align:right">
            <div class="price-entry-price" style="${isBest ? '' : 'color:var(--text)'}">
              Rp ${fmtNum(e.harga)}
            </div>
            ${trend ? renderTrendBadge(trend) : ''}
            ${isBest ? '<div style="font-size:9px;color:var(--green);margin-top:2px;">Terbaik</div>' : ''}
          </div>
        </div>
        ${e.moq ? `<div class="price-entry-moq">MOQ: ${e.moq} ${p.satuan || 'pcs'}</div>` : ''}
        ${e.catatan ? `<div class="price-entry-meta" style="margin-top:4px">${e.catatan}</div>` : ''}
        <div class="price-entry-moq" style="margin-top:6px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <span>Update: ${fmtDate(e.updatedAt)} · ${e.updatedBy}</span>
          ${histCount >= 2
            ? `<span class="history-toggle js-toggle-history"
                id="${toggleId}"
                data-panel-id="${panelId}"
                data-toggle-id="${toggleId}">▼ ${histCount} riwayat</span>`
            : ''}
          <span class="js-open-update-price detail-action-link"
            data-entry-id="${e.id}" data-product-id="${id}"
            style="color:var(--accent);margin-left:auto;">Update Harga</span>
          <span class="js-confirm-del-price detail-action-link"
            data-price-id="${e.id}" data-product-id="${id}"
            style="color:var(--red);">Hapus</span>
        </div>
        ${renderHistoryTimeline(panelId, history, id, false)}
      </div>`;
    }).join('') || '<div class="empty-state"><div class="empty-icon">💰</div><div class="empty-text">Belum ada harga.</div></div>';

    document.getElementById('product-detail-content').innerHTML = `
      <div class="detail-section">
        <div class="detail-section-title">Informasi Produk</div>
        <div class="detail-card">
          <div class="detail-field"><div class="detail-field-label">Kategori</div>
            <div class="detail-field-value">${p.category || '—'}</div></div>
          <div class="detail-field"><div class="detail-field-label">Satuan</div>
            <div class="detail-field-value">${p.satuan || '—'}</div></div>
          ${p.catatan ? `<div class="detail-field"><div class="detail-field-label">Spesifikasi / Catatan</div>
            <div class="detail-field-value">${p.catatan}</div></div>` : ''}
          <div class="detail-field"><div class="detail-field-label">Ditambahkan oleh</div>
            <div class="detail-field-value">${p.createdBy || '—'} · ${fmtDate(p.createdAt)}</div></div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Harga dari Supplier (${activeEntries.length})</span>
          <span class="js-add-price detail-action-btn" data-id="${id}">+</span>
        </div>
        ${priceCards}
      </div>`;

    showScreen(SCREEN.PRODUCT_DETAIL);
  }

  // ─────────────────────────────────────────
  // JASA DETAIL
  // ─────────────────────────────────────────
  function openJasaDetail(productId) {
    currentJasaId = productId;
    const p = DB.products.find(x => x.id === productId);
    if (!p) return;

    document.getElementById('detail-jasa-name').textContent = p.name;
    document.getElementById('detail-jasa-cat').textContent  = `${p.category || ''} · ${p.satuan || 'per project'}`;

    const activeEntries = latestPricePerSupplier(productId).sort((a, b) =>
      parseFloat(a.harga) - parseFloat(b.harga));
    const bestPrice = activeEntries[0] ? parseFloat(activeEntries[0].harga) : null;

    const priceCards = activeEntries.map(e => {
      const s         = DB.suppliers.find(x => x.id === e.supplierId);
      const isBest    = parseFloat(e.harga) === bestPrice;
      const history   = priceHistoryForSupplier(productId, e.supplierId);
      const trend     = getTrend(history);
      const panelId   = `hist-panel-j-${e.supplierId}`;
      const toggleId  = `hist-toggle-j-${e.supplierId}`;
      const histCount = history.length;
      const isJasaLevel = s?.level === SUPPLIER_LEVEL.JASA;

      return `
      <div class="detail-card js-open-supplier-contact" data-id="${s?.id}"
        style="${isBest ? 'border-color:rgba(139,92,246,.35);' : ''}">
        <div class="price-entry-row">
          <div>
            <div class="price-entry-name">${s?.name || '?'}
              <span class="level-badge ${isJasaLevel ? 'jasa' : (s?.level || '').toLowerCase()}"
                style="font-size:9px">${isJasaLevel ? '🔧' : (s?.level || '')}</span>
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px;">${s?.kota || ''}</div>
          </div>
          <div style="text-align:right">
            <div class="price-entry-price" style="color:${isBest ? 'var(--purple)' : 'var(--text)'}">
              Rp ${fmtNum(e.harga)}
            </div>
            <div style="font-size:10px;color:var(--muted)">${e.satuan || p.satuan || 'per project'}</div>
            ${trend ? renderTrendBadge(trend) : ''}
            ${isBest ? '<div style="font-size:9px;color:var(--purple);margin-top:2px;">Terbaik</div>' : ''}
          </div>
        </div>
        ${e.catatan ? `<div class="price-entry-meta" style="margin-top:6px">${e.catatan}</div>` : ''}
        <div class="price-entry-moq" style="margin-top:6px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <span>Update: ${fmtDate(e.updatedAt)} · ${e.updatedBy}</span>
          ${histCount >= 2
            ? `<span class="history-toggle js-toggle-history"
                id="${toggleId}"
                data-panel-id="${panelId}"
                data-toggle-id="${toggleId}">▼ ${histCount} riwayat</span>`
            : ''}
          <span class="js-open-update-price detail-action-link"
            data-entry-id="${e.id}" data-product-id="${productId}"
            style="color:var(--accent);margin-left:auto;">Update Harga</span>
          <span class="js-confirm-del-price detail-action-link"
            data-price-id="${e.id}" data-product-id="${productId}"
            style="color:var(--red);">Hapus</span>
        </div>
        ${renderHistoryTimeline(panelId, history, productId, true)}
      </div>`;
    }).join('') || '<div class="empty-state"><div class="empty-icon">💰</div><div class="empty-text">Belum ada harga.</div></div>';

    document.getElementById('jasa-detail-content').innerHTML = `
      <div class="detail-section">
        <div class="detail-section-title">Informasi Layanan</div>
        <div class="detail-card">
          <div class="detail-field"><div class="detail-field-label">Kategori</div>
            <div class="detail-field-value">${p.category || '—'}</div></div>
          <div class="detail-field"><div class="detail-field-label">Unit Rate</div>
            <div class="detail-field-value">${p.satuan || '—'}</div></div>
          ${p.catatan ? `<div class="detail-field"><div class="detail-field-label">Catatan / Scope</div>
            <div class="detail-field-value">${p.catatan}</div></div>` : ''}
          <div class="detail-field"><div class="detail-field-label">Ditambahkan oleh</div>
            <div class="detail-field-value">${p.createdBy || '—'} · ${fmtDate(p.createdAt)}</div></div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Penyedia Jasa (${activeEntries.length})</span>
          <span class="js-add-price-for-jasa detail-action-btn"
            style="color:var(--purple)" data-id="${productId}">+</span>
        </div>
        ${priceCards}
      </div>`;

    showScreen(SCREEN.JASA_DETAIL);
  }

  // ─────────────────────────────────────────
  // SUPPLIER CONTACT OVERLAY
  // ─────────────────────────────────────────
  function openSupplierContact(supplierId) {
    const s = DB.suppliers.find(x => x.id === supplierId);
    if (!s) return;

    document.getElementById('contact-supplier-name').textContent = s.name;
    const phone = String(s.kontak || '');
    document.getElementById('contact-phone').textContent = phone || '—';

    const waBtn = document.getElementById('contact-wa-btn');
    if (phone) {
      const digits   = phone.replace(/\D/g, '');
      const waNumber = digits.startsWith('0') ? '62' + digits.slice(1) : digits;
      waBtn.href = `https://wa.me/${waNumber}`;
      waBtn.style.display = 'flex';
    } else {
      waBtn.style.display = 'none';
    }

    document.getElementById('contact-info').innerHTML = `
      <div><span style="color:var(--muted)">Level:</span> ${s.level}</div>
      <div><span style="color:var(--muted)">Kota:</span> ${s.kota || '—'}</div>
      ${s.authorized ? '<div style="color:var(--green)">✓ Authorized / Ada SPD</div>' : ''}
      ${(s.units || []).length ? `<div><span style="color:var(--muted)">Unit:</span> ${s.units.join(', ')}</div>` : ''}
      ${s.catatan ? `<div><span style="color:var(--muted)">Catatan:</span> ${s.catatan}</div>` : ''}`;

    openSheet('overlay-supplier-contact');
  }

  // ─────────────────────────────────────────
  // ADD / EDIT SUPPLIER
  // ─────────────────────────────────────────
  function openAddSupplier() {
    editMode = false;
    currentSupplierId = null;
    document.getElementById('sheet-supplier-title').textContent = 'Tambah Supplier';
    clearForm(['f-supplier-name','f-supplier-kontak','f-supplier-kota','f-supplier-catatan']);
    document.getElementById('f-supplier-level').value  = '';
    document.getElementById('f-supplier-auth').checked = false;
    renderUnitChips();
    openSheet('overlay-supplier');
  }

  function openEditSupplier() {
    editMode = true;
    const s = DB.suppliers.find(x => x.id === currentSupplierId);
    if (!s) return;
    document.getElementById('sheet-supplier-title').textContent = 'Edit Supplier';
    document.getElementById('f-supplier-name').value    = s.name;
    document.getElementById('f-supplier-kontak').value  = s.kontak || '';
    document.getElementById('f-supplier-kota').value    = s.kota   || '';
    document.getElementById('f-supplier-level').value   = s.level;
    document.getElementById('f-supplier-auth').checked  = !!s.authorized;
    document.getElementById('f-supplier-catatan').value = s.catatan || '';
    renderUnitChips();
    setTimeout(() => {
      document.querySelectorAll('#f-supplier-units .multi-chip').forEach(chip => {
        if ((s.units || []).includes(chip.textContent.trim())) chip.classList.add('selected');
      });
    }, 50);
    openSheet('overlay-supplier');
  }

  async function saveSupplier() {
    const name  = document.getElementById('f-supplier-name').value.trim();
    const level = document.getElementById('f-supplier-level').value;
    if (!name || !level) { showToast('Nama & level wajib diisi', 'error'); return; }

    const units    = [...document.querySelectorAll('#f-supplier-units .multi-chip.selected')].map(c => c.textContent.trim());
    const original = editMode ? DB.suppliers.find(x => x.id === currentSupplierId) : null;
    const payload  = {
      id:         editMode ? currentSupplierId : genId(),
      name, level,
      kontak:     document.getElementById('f-supplier-kontak').value.trim(),
      kota:       document.getElementById('f-supplier-kota').value.trim(),
      authorized: document.getElementById('f-supplier-auth').checked,
      catatan:    document.getElementById('f-supplier-catatan').value.trim(),
      units,
      createdBy:  original ? original.createdBy : getUser().name,
      createdAt:  original ? original.createdAt : new Date().toISOString()
    };

    closeSheet('overlay-supplier');
    showLoading(editMode ? 'Menyimpan perubahan...' : 'Menambah supplier...');

    try {
      if (ARKANA_SCRIPT_URL) {
        await api(editMode ? 'updateSupplier' : 'addSupplier', payload);
        await fetchAll();
      } else {
        if (editMode) {
          const idx = DB.suppliers.findIndex(x => x.id === currentSupplierId);
          if (idx >= 0) DB.suppliers[idx] = payload;
        } else {
          DB.suppliers.push(payload);
        }
        saveToCache(DB); renderAll();
      }
      logActivity(
        editMode ? 'Edit Supplier' : 'Tambah Supplier',
        `${getUser().name} ${editMode ? 'mengedit' : 'menambah'} supplier: ${name}`
      );
      showToast(editMode ? 'Supplier diperbarui ✓' : 'Supplier ditambahkan ✓', 'success');
      if (editMode && currentSupplierId) openSupplierDetail(currentSupplierId);
    } catch (e) {
      showToast('Gagal: ' + e.message, 'error');
    } finally { hideLoading(); }
  }

  function confirmDeleteSupplier() {
    const s = DB.suppliers.find(x => x.id === currentSupplierId);
    showConfirm('Hapus Supplier', `Hapus "${s?.name}"? Semua data harga dari supplier ini juga akan dihapus.`, async () => {
      showLoading('Menghapus...');
      try {
        if (ARKANA_SCRIPT_URL) { await api('deleteSupplier', { id: currentSupplierId }); await fetchAll(); }
        else {
          DB.suppliers    = DB.suppliers.filter(x => x.id !== currentSupplierId);
          DB.priceEntries = DB.priceEntries.filter(x => x.supplierId !== currentSupplierId);
          saveToCache(DB); renderAll();
        }
        logActivity('Hapus Supplier', `${getUser().name} menghapus supplier: ${s?.name}`);
        showToast('Supplier dihapus', 'success');
        goBack(SCREEN.MAIN);
      } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
      finally { hideLoading(); }
    });
  }

  // ─────────────────────────────────────────
  // ADD / EDIT PRODUCT
  // ─────────────────────────────────────────
  function openAddProduct(supplierId) {
    editMode = false;
    currentProductId = null;
    document.getElementById('sheet-product-title').textContent = 'Tambah Produk';
    clearForm(['f-product-name','f-product-category','f-product-catatan','f-price-moq']);
    document.getElementById('f-product-satuan').value          = 'pcs';
    document.getElementById('f-price-supplier').value          = supplierId || '';
    document.getElementById('f-price-harga').value             = '';
    document.getElementById('price-entry-group').style.display = '';
    openSheet('overlay-product');
  }

  function openEditProduct() {
    editMode = true;
    const p = DB.products.find(x => x.id === currentProductId);
    if (!p) return;
    document.getElementById('sheet-product-title').textContent = 'Edit Produk';
    document.getElementById('f-product-name').value      = p.name;
    document.getElementById('f-product-category').value  = p.category || '';
    document.getElementById('f-product-satuan').value    = p.satuan   || 'pcs';
    document.getElementById('f-product-catatan').value   = p.catatan  || '';
    document.getElementById('price-entry-group').style.display = 'none';
    openSheet('overlay-product');
  }

  async function saveProduct() {
    const name = document.getElementById('f-product-name').value.trim();
    if (!name) { showToast('Nama produk wajib diisi', 'error'); return; }

    const payload = {
      id:        editMode ? currentProductId : genId(),
      name,
      category:  document.getElementById('f-product-category').value.trim(),
      satuan:    document.getElementById('f-product-satuan').value,
      catatan:   document.getElementById('f-product-catatan').value.trim(),
      createdBy: getUser().name,
      createdAt: new Date().toISOString()
    };

    const supplierId = document.getElementById('f-price-supplier')?.value;
    const hargaVal   = document.getElementById('f-price-harga')?.value;
    const moqVal     = document.getElementById('f-price-moq')?.value;
    let pricePayload = null;
    if (!editMode && supplierId && hargaVal) {
      pricePayload = {
        id: genId(), productId: payload.id, supplierId,
        harga: parseRp(hargaVal), moq: moqVal ? parseInt(moqVal) : null,
        catatan: '', updatedBy: getUser().name, updatedAt: new Date().toISOString()
      };
    }

    closeSheet('overlay-product');
    showLoading('Menyimpan produk...');

    try {
      if (ARKANA_SCRIPT_URL) {
        await api(editMode ? 'updateProduct' : 'addProduct', { product: payload, price: pricePayload });
        await fetchAll();
      } else {
        if (editMode) {
          const idx = DB.products.findIndex(x => x.id === currentProductId);
          if (idx >= 0) DB.products[idx] = payload;
        } else {
          DB.products.push(payload);
          if (pricePayload) DB.priceEntries.push(pricePayload);
        }
        saveToCache(DB); renderAll();
      }
      logActivity(
        editMode ? 'Edit Produk' : 'Tambah Produk',
        `${getUser().name} ${editMode ? 'mengedit' : 'menambah'} produk: ${name}`
      );
      showToast(editMode ? 'Produk diperbarui ✓' : 'Produk ditambahkan ✓', 'success');
      if (editMode && currentProductId) openProductDetail(currentProductId);
      else if (!editMode && currentSupplierId) openSupplierDetail(currentSupplierId);
    } catch (e) {
      showToast('Gagal: ' + e.message, 'error');
    } finally { hideLoading(); }
  }

  function confirmDeleteProduct() {
    const p = DB.products.find(x => x.id === currentProductId);
    showConfirm('Hapus Produk', `Hapus "${p?.name}"? Semua data harga produk ini juga akan dihapus.`, async () => {
      showLoading('Menghapus...');
      try {
        if (ARKANA_SCRIPT_URL) { await api('deleteProduct', { id: currentProductId }); await fetchAll(); }
        else {
          DB.products     = DB.products.filter(x => x.id !== currentProductId);
          DB.priceEntries = DB.priceEntries.filter(x => x.productId !== currentProductId);
          saveToCache(DB); renderAll();
        }
        logActivity('Hapus Produk', `${getUser().name} menghapus produk: ${p?.name}`);
        showToast('Produk dihapus', 'success');
        goBack(SCREEN.MAIN);
      } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
      finally { hideLoading(); }
    });
  }

  // ─────────────────────────────────────────
  // ADD / EDIT JASA
  // ─────────────────────────────────────────
  function openAddJasa(supplierId) {
    jasaEditMode = false;
    clearForm(['f-jasa-nama','f-jasa-category','f-jasa-harga','f-jasa-catatan']);
    document.getElementById('f-jasa-satuan').value = 'per project';
    document.getElementById('jasa-price-group').style.display = '';
    populateSupplierDropdowns();
    if (supplierId) {
      document.getElementById('f-jasa-supplier').value = supplierId;
      document.getElementById('jasa-sheet-sub').textContent =
        'Harga awal dari: ' + (DB.suppliers.find(s => s.id === supplierId)?.name || 'supplier ini');
    } else {
      document.getElementById('f-jasa-supplier').value = '';
      document.getElementById('jasa-sheet-sub').textContent = 'Data akan tersimpan ke Google Sheet';
    }
    openSheet('overlay-jasa');
  }

  function openEditJasa() {
    jasaEditMode = true;
    const p = DB.products.find(x => x.id === currentJasaId);
    if (!p) return;
    document.getElementById('f-jasa-nama').value      = p.name;
    document.getElementById('f-jasa-category').value  = p.category || '';
    document.getElementById('f-jasa-satuan').value    = p.satuan   || 'per project';
    document.getElementById('f-jasa-catatan').value   = p.catatan  || '';
    document.getElementById('f-jasa-supplier').value  = '';
    document.getElementById('f-jasa-harga').value     = '';
    document.getElementById('jasa-sheet-sub').textContent = 'Edit layanan jasa';
    document.getElementById('jasa-price-group').style.display = 'none';
    openSheet('overlay-jasa');
  }

  // Single save handler — routes based on jasaEditMode flag
  async function saveJasa() {
    if (jasaEditMode) { await _saveJasaEdit(); return; }
    await _saveJasaNew();
  }

  async function _saveJasaNew() {
    const namaJasa = document.getElementById('f-jasa-nama').value.trim();
    if (!namaJasa) { showToast('Nama layanan wajib diisi', 'error'); return; }

    const productPayload = {
      id:        genId(),
      name:      namaJasa,
      category:  document.getElementById('f-jasa-category').value.trim(),
      satuan:    document.getElementById('f-jasa-satuan').value,
      catatan:   document.getElementById('f-jasa-catatan').value.trim(),
      type:      ITEM_TYPE.JASA,
      createdBy: getUser().name,
      createdAt: new Date().toISOString()
    };

    const supplierId = document.getElementById('f-jasa-supplier').value;
    const hargaVal   = document.getElementById('f-jasa-harga').value;
    let pricePayload = null;
    if (supplierId && hargaVal) {
      pricePayload = {
        id: genId(), productId: productPayload.id, supplierId,
        harga: parseRp(hargaVal),
        satuan: productPayload.satuan,
        catatan: '', updatedBy: getUser().name, updatedAt: new Date().toISOString()
      };
    }

    closeSheet('overlay-jasa');
    showLoading('Menyimpan...');

    try {
      if (ARKANA_SCRIPT_URL) {
        await api('addProduct', { product: productPayload, price: pricePayload });
        await fetchAll();
      } else {
        DB.products.push(productPayload);
        if (pricePayload) DB.priceEntries.push(pricePayload);
        saveToCache(DB); renderAll();
      }
      logActivity('Tambah Jasa', `${getUser().name} menambah layanan jasa: ${namaJasa}`);
      showToast('Layanan jasa ditambahkan ✓', 'success');
      renderJasa();
      if (currentSupplierId) openSupplierDetail(currentSupplierId);
    } catch (e) {
      showToast('Gagal: ' + e.message, 'error');
    } finally { hideLoading(); }
  }

  async function _saveJasaEdit() {
    const p    = DB.products.find(x => x.id === currentJasaId);
    if (!p) return;
    const name = document.getElementById('f-jasa-nama').value.trim();
    if (!name) { showToast('Nama layanan wajib diisi', 'error'); return; }

    const payload = {
      id: currentJasaId, name,
      category:  document.getElementById('f-jasa-category').value.trim(),
      satuan:    document.getElementById('f-jasa-satuan').value,
      catatan:   document.getElementById('f-jasa-catatan').value.trim(),
      type:      ITEM_TYPE.JASA,
      createdBy: p.createdBy,
      createdAt: p.createdAt
    };

    closeSheet('overlay-jasa');
    showLoading('Menyimpan...');

    try {
      if (ARKANA_SCRIPT_URL) {
        await api('updateProduct', { product: payload });
        await fetchAll();
      } else {
        const idx = DB.products.findIndex(x => x.id === currentJasaId);
        if (idx >= 0) DB.products[idx] = payload;
        saveToCache(DB); renderAll();
      }
      logActivity('Edit Jasa', `${getUser().name} mengedit layanan: ${name}`);
      showToast('Layanan diperbarui ✓', 'success');
      openJasaDetail(currentJasaId);
    } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
    finally { hideLoading(); }
  }

  function confirmDeleteJasa() {
    const p = DB.products.find(x => x.id === currentJasaId);
    showConfirm('Hapus Layanan', `Hapus "${p?.name}"? Semua data harga juga akan dihapus.`, async () => {
      showLoading('Menghapus...');
      try {
        if (ARKANA_SCRIPT_URL) { await api('deleteProduct', { id: currentJasaId }); await fetchAll(); }
        else {
          DB.products     = DB.products.filter(x => x.id !== currentJasaId);
          DB.priceEntries = DB.priceEntries.filter(x => x.productId !== currentJasaId);
          saveToCache(DB); renderAll();
        }
        logActivity('Hapus Jasa', `${getUser().name} menghapus layanan: ${p?.name}`);
        showToast('Layanan dihapus', 'success');
        goBack(SCREEN.MAIN);
      } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
      finally { hideLoading(); }
    });
  }

  // ─────────────────────────────────────────
  // ADD PRICE ENTRY
  // ─────────────────────────────────────────
  function openAddPrice(productId) {
    priceEntryProductId = productId;
    const p = DB.products.find(x => x.id === productId);
    document.getElementById('price-sheet-title').textContent = 'Tambah Harga';
    document.getElementById('price-sheet-sub').textContent   = `untuk: ${p?.name || ''}`;
    clearForm(['f-pe-harga','f-pe-moq','f-pe-catatan']);
    document.getElementById('f-pe-supplier').value   = '';
    document.getElementById('f-pe-supplier').disabled = false;
    document.getElementById('pe-moq-group').style.display    = '';
    document.getElementById('pe-satuan-group').style.display = 'none';
    openSheet('overlay-price');
  }

  function openAddPriceForJasa(productId) {
    priceEntryProductId = productId;
    const p = DB.products.find(x => x.id === productId);
    document.getElementById('price-sheet-title').textContent = 'Tambah Penyedia Jasa';
    document.getElementById('price-sheet-sub').textContent   = `untuk: ${p?.name || ''}`;
    document.getElementById('f-pe-supplier').value   = '';
    document.getElementById('f-pe-supplier').disabled = false;
    document.getElementById('f-pe-harga').value  = '';
    document.getElementById('f-pe-moq').value    = '';
    document.getElementById('f-pe-catatan').value = '';
    document.getElementById('pe-moq-group').style.display = 'none';
    const satuanEl = document.getElementById('f-pe-satuan');
    satuanEl.innerHTML = SATUAN_JASA.map(s => `<option value="${s}">${s}</option>`).join('');
    satuanEl.value = p?.satuan || 'per project';
    document.getElementById('pe-satuan-group').style.display = '';
    openSheet('overlay-price');
  }

  // updatePriceEntryId tracks which entry we're updating
  let _priceMode = 'add'; // 'add' | 'update'

  function openUpdatePrice(entryId, productId) {
    _priceMode = 'update';
    updatePriceEntryId   = entryId;
    updatePriceProductId = productId;
    const e = DB.priceEntries.find(x => x.id === entryId);
    const p = DB.products.find(x => x.id === productId);
    if (!e || !p) return;

    document.getElementById('price-sheet-title').textContent = 'Update Harga';
    document.getElementById('price-sheet-sub').textContent   =
      `${p.name} · ${DB.suppliers.find(s => s.id === e.supplierId)?.name || ''}`;
    document.getElementById('f-pe-supplier').value   = e.supplierId;
    document.getElementById('f-pe-supplier').disabled = true;
    document.getElementById('f-pe-harga').value  = e.harga ? formatRp(String(e.harga)) : '';
    document.getElementById('f-pe-moq').value    = e.moq   || '';
    document.getElementById('f-pe-catatan').value = e.catatan || '';
    document.getElementById('pe-satuan-group').style.display = 'none';
    document.getElementById('pe-moq-group').style.display    = p.type === ITEM_TYPE.JASA ? 'none' : '';
    openSheet('overlay-price');
  }

  // Single price save handler — routes by _priceMode
  async function savePriceEntry() {
    if (_priceMode === 'update') { await _saveUpdatePrice(); return; }
    await _saveNewPriceEntry();
  }

  async function _saveNewPriceEntry() {
    const supplierId = document.getElementById('f-pe-supplier').value;
    const hargaVal   = document.getElementById('f-pe-harga').value;
    if (!supplierId || !hargaVal) { showToast('Supplier & harga wajib diisi', 'error'); return; }

    const payload = {
      id: genId(), productId: priceEntryProductId, supplierId,
      harga: parseRp(hargaVal),
      moq:   document.getElementById('f-pe-moq').value ? parseInt(document.getElementById('f-pe-moq').value) : null,
      catatan: document.getElementById('f-pe-catatan').value.trim(),
      updatedBy: getUser().name, updatedAt: new Date().toISOString()
    };

    _resetPriceSheet();
    showLoading('Menyimpan harga...');
    try {
      if (ARKANA_SCRIPT_URL) { await api('addPrice', payload); await fetchAll(); }
      else { DB.priceEntries.push(payload); saveToCache(DB); renderAll(); }
      const sup  = DB.suppliers.find(s => s.id === supplierId);
      const prod = DB.products.find(p => p.id === priceEntryProductId);
      logActivity('Tambah Harga', `${getUser().name} menambah harga ${prod?.name || ''} dari ${sup?.name || ''}: Rp ${fmtNum(payload.harga)}`);
      showToast('Harga ditambahkan ✓', 'success');
      if (currentProductId) openProductDetail(currentProductId);
    } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
    finally { hideLoading(); }
  }

  async function _saveUpdatePrice() {
    const hargaVal = document.getElementById('f-pe-harga').value;
    if (!hargaVal) { showToast('Harga wajib diisi', 'error'); return; }

    const oldEntry = DB.priceEntries.find(x => x.id === updatePriceEntryId);
    const payload  = {
      id: genId(),
      productId:  updatePriceProductId,
      supplierId: oldEntry.supplierId,
      harga:      parseRp(hargaVal),
      moq:        document.getElementById('f-pe-moq').value ? parseInt(document.getElementById('f-pe-moq').value) : null,
      catatan:    document.getElementById('f-pe-catatan').value.trim(),
      updatedBy:  getUser().name,
      updatedAt:  new Date().toISOString()
    };

    _resetPriceSheet();
    showLoading('Menyimpan harga baru...');
    try {
      if (ARKANA_SCRIPT_URL) { await api('addPrice', payload); await fetchAll(); }
      else { DB.priceEntries.push(payload); saveToCache(DB); renderAll(); }
      const p   = DB.products.find(x => x.id === updatePriceProductId);
      const sup = DB.suppliers.find(s => s.id === oldEntry.supplierId);
      logActivity('Update Harga', `${getUser().name} update harga ${p?.name || ''} dari ${sup?.name || ''}: Rp ${fmtNum(payload.harga)}`);
      showToast('Harga diperbarui ✓', 'success');
      if (p?.type === ITEM_TYPE.JASA) openJasaDetail(updatePriceProductId);
      else openProductDetail(updatePriceProductId);
    } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
    finally { hideLoading(); }
  }

  function _resetPriceSheet() {
    closeSheet('overlay-price');
    _priceMode = 'add';
    document.getElementById('f-pe-supplier').disabled = false;
    document.getElementById('price-sheet-title').textContent = 'Tambah Harga';
    document.getElementById('pe-moq-group').style.display    = '';
    document.getElementById('pe-satuan-group').style.display = 'none';
  }

  function confirmDeletePrice(priceId, productId) {
    showConfirm('Hapus Harga', 'Hapus data harga ini?', async () => {
      showLoading('Menghapus...');
      try {
        if (ARKANA_SCRIPT_URL) { await api('deletePrice', { id: priceId }); await fetchAll(); }
        else {
          DB.priceEntries = DB.priceEntries.filter(x => x.id !== priceId);
          saveToCache(DB); renderAll();
        }
        logActivity('Hapus Harga', `${getUser().name} menghapus data harga`);
        showToast('Harga dihapus', 'success');
        const pid = productId || currentProductId;
        if (pid) {
          const p = DB.products.find(x => x.id === pid);
          if (p?.type === ITEM_TYPE.JASA) openJasaDetail(pid);
          else openProductDetail(pid);
        }
      } catch (e) { showToast('Gagal: ' + e.message, 'error'); }
      finally { hideLoading(); }
    });
  }

  // ─────────────────────────────────────────
  // FAB / ADD CHOICE
  // ─────────────────────────────────────────
  function openAddSheet() {
    if (currentTab === TAB.SUPPLIERS)      openAddSupplier();
    else if (currentTab === TAB.PRODUCTS)  openAddProduct();
    else if (currentTab === TAB.JASA)      openAddJasa(null);
  }

  // ─────────────────────────────────────────
  // FILTER HANDLERS
  // ─────────────────────────────────────────
  function setLevelFilter(level) {
    levelFilter = level;
    cityFilter  = '';
    unitFilter  = '';
    renderSuppliers();
  }

  function setUnitFilter(unit) {
    unitFilter = unit;
    cityFilter = '';
    renderSuppliers();
  }

  function setCityFilter(city) {
    cityFilter = city;
    renderSuppliers();
  }

  // ─────────────────────────────────────────
  // EVENT BINDING  (R1 — no inline handlers)
  // All events bound here in init via addEventListener.
  // Dynamic content handled via event delegation on containers.
  // ─────────────────────────────────────────
  function _bindEvents() {

    // ── Tab bar ──
    document.getElementById('tab-suppliers').addEventListener('click', () => switchTab(TAB.SUPPLIERS));
    document.getElementById('tab-products').addEventListener('click',  () => switchTab(TAB.PRODUCTS));
    document.getElementById('tab-jasa').addEventListener('click',      () => switchTab(TAB.JASA));
    document.getElementById('tab-compare').addEventListener('click',   () => switchTab(TAB.COMPARE));

    // ── FAB ──
    document.getElementById('fab-btn').addEventListener('click', openAddSheet);

    // ── Search inputs ──
    document.getElementById('search-suppliers').addEventListener('input', renderSuppliers);
    document.getElementById('search-products').addEventListener('input',  renderProducts);
    document.getElementById('search-jasa').addEventListener('input',      renderJasa);
    document.getElementById('search-compare').addEventListener('input',   renderCompare);

    // ── Level filter chips (static) ──
    document.getElementById('filter-level').addEventListener('click', e => {
      const chip = e.target.closest('.chip[data-level]');
      if (!chip) return;
      document.querySelectorAll('#filter-level .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      setLevelFilter(chip.dataset.level);
    });

    // ── Unit filter chips (dynamic) ──
    document.getElementById('filter-unit').addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip || !('unit' in chip.dataset)) return;
      setUnitFilter(chip.dataset.unit);
    });

    // ── City filter chips (dynamic) ──
    document.getElementById('filter-city').addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip || !('city' in chip.dataset)) return;
      setCityFilter(chip.dataset.city);
    });

    // ── Supplier list (delegation) ──
    document.getElementById('list-suppliers').addEventListener('click', e => {
      const card = e.target.closest('.js-open-supplier');
      if (card) openSupplierDetail(card.dataset.id);
    });

    // ── Product / Jasa item cards (delegation on both panes + compare) ──
    ['list-products','list-jasa','list-compare'].forEach(listId => {
      document.getElementById(listId).addEventListener('click', e => {
        const card = e.target.closest('.js-item-card');
        if (!card) return;
        if (card.dataset.action === 'open-jasa-detail') openJasaDetail(card.dataset.id);
        else openProductDetail(card.dataset.id);
      });
    });

    // ── Supplier detail content (delegation) ──
    document.getElementById('supplier-detail-content').addEventListener('click', e => {
      const prodCard = e.target.closest('.js-open-product-detail');
      if (prodCard) { openProductDetail(prodCard.dataset.id); return; }
      const jasaCard = e.target.closest('.js-open-jasa-detail');
      if (jasaCard) { openJasaDetail(jasaCard.dataset.id); return; }
      const addPrice = e.target.closest('.js-add-price-for-supplier');
      if (addPrice) { openAddProduct(currentSupplierId); return; }
      const addJasa  = e.target.closest('.js-add-jasa-for-supplier');
      if (addJasa)  { openAddJasa(addJasa.dataset.id); return; }
    });

    // ── Product detail content (delegation) ──
    document.getElementById('product-detail-content').addEventListener('click', e => {
      // Check specific targets FIRST — supplier contact is the fallback (entire card)
      const toggle = e.target.closest('.js-toggle-history');
      if (toggle) {
        e.stopPropagation();
        _toggleHistory(toggle.dataset.panelId, toggle); return;
      }
      const updateBtn = e.target.closest('.js-open-update-price');
      if (updateBtn) {
        e.stopPropagation();
        openUpdatePrice(updateBtn.dataset.entryId, updateBtn.dataset.productId); return;
      }
      const delBtn = e.target.closest('.js-confirm-del-price');
      if (delBtn) {
        e.stopPropagation();
        confirmDeletePrice(delBtn.dataset.priceId, delBtn.dataset.productId); return;
      }
      const delHistory = e.target.closest('.js-del-price');
      if (delHistory) {
        e.stopPropagation();
        confirmDeletePrice(delHistory.dataset.priceId, delHistory.dataset.productId); return;
      }
      const addPrice = e.target.closest('.js-add-price');
      if (addPrice) { openAddPrice(addPrice.dataset.id); return; }
      // Supplier contact last — matches the whole card, only if nothing else matched
      const contactCard = e.target.closest('.js-open-supplier-contact');
      if (contactCard) { openSupplierContact(contactCard.dataset.id); return; }
    });

    // ── Jasa detail content (delegation — mirrors product detail) ──
    document.getElementById('jasa-detail-content').addEventListener('click', e => {
      // Check specific targets FIRST — supplier contact is the fallback (entire card)
      const toggle = e.target.closest('.js-toggle-history');
      if (toggle) {
        e.stopPropagation();
        _toggleHistory(toggle.dataset.panelId, toggle); return;
      }
      const updateBtn = e.target.closest('.js-open-update-price');
      if (updateBtn) {
        e.stopPropagation();
        openUpdatePrice(updateBtn.dataset.entryId, updateBtn.dataset.productId); return;
      }
      const delBtn = e.target.closest('.js-confirm-del-price');
      if (delBtn) {
        e.stopPropagation();
        confirmDeletePrice(delBtn.dataset.priceId, delBtn.dataset.productId); return;
      }
      const delHistory = e.target.closest('.js-del-price');
      if (delHistory) {
        e.stopPropagation();
        confirmDeletePrice(delHistory.dataset.priceId, delHistory.dataset.productId); return;
      }
      const addJasaPrice = e.target.closest('.js-add-price-for-jasa');
      if (addJasaPrice) { openAddPriceForJasa(addJasaPrice.dataset.id); return; }
      // Supplier contact last — fallback for tapping the card body
      const contactCard = e.target.closest('.js-open-supplier-contact');
      if (contactCard) { openSupplierContact(contactCard.dataset.id); return; }
    });

    // ── Back buttons (static) ──
    document.getElementById('back-to-main-supplier').addEventListener('click', () => goBack(SCREEN.MAIN));
    document.getElementById('back-to-main-product').addEventListener('click',  () => goBack(SCREEN.MAIN));
    document.getElementById('back-to-main-jasa').addEventListener('click',     () => goBack(SCREEN.MAIN));

    // ── Supplier detail actions ──
    document.getElementById('btn-edit-supplier').addEventListener('click',   openEditSupplier);
    document.getElementById('btn-delete-supplier').addEventListener('click', confirmDeleteSupplier);

    // ── Product detail actions ──
    document.getElementById('btn-edit-product').addEventListener('click',   openEditProduct);
    document.getElementById('btn-delete-product').addEventListener('click', confirmDeleteProduct);

    // ── Jasa detail actions ──
    document.getElementById('btn-edit-jasa').addEventListener('click',   openEditJasa);
    document.getElementById('btn-delete-jasa').addEventListener('click', confirmDeleteJasa);

    // ── Supplier form ──
    document.getElementById('btn-save-supplier').addEventListener('click', saveSupplier);
    document.getElementById('btn-cancel-supplier').addEventListener('click', () => closeSheet('overlay-supplier'));
    document.getElementById('f-supplier-units').addEventListener('click', e => {
      const chip = e.target.closest('.js-toggle-chip');
      if (chip) chip.classList.toggle('selected');
    });

    // ── Product form ──
    document.getElementById('btn-save-product').addEventListener('click', saveProduct);
    document.getElementById('btn-cancel-product').addEventListener('click', () => closeSheet('overlay-product'));

    // ── Price form ──
    document.getElementById('btn-save-price').addEventListener('click', savePriceEntry);
    document.getElementById('btn-cancel-price').addEventListener('click', () => {
      _resetPriceSheet();
    });

    // ── Jasa form ──
    document.getElementById('btn-save-jasa').addEventListener('click', saveJasa);
    document.getElementById('btn-cancel-jasa').addEventListener('click', () => closeSheet('overlay-jasa'));

    // ── Add choice sheet ──
    document.getElementById('btn-add-choice-supplier').addEventListener('click', () => {
      closeSheet('overlay-add-choice'); openAddSupplier();
    });
    document.getElementById('btn-add-choice-product').addEventListener('click', () => {
      closeSheet('overlay-add-choice'); openAddProduct();
    });
    document.getElementById('btn-add-choice-jasa').addEventListener('click', () => {
      closeSheet('overlay-add-choice'); openAddJasa(null);
    });
    document.getElementById('btn-cancel-add-choice').addEventListener('click', () => closeSheet('overlay-add-choice'));

    // ── Contact overlay ──
    document.getElementById('btn-close-contact').addEventListener('click', () => closeSheet('overlay-supplier-contact'));

    // ── Rp currency formatting on all money inputs ──
    bindRpInputs('f-price-harga', 'f-pe-harga', 'f-jasa-harga');

    // ── Overlay background tap to close ──
    document.querySelectorAll('.overlay').forEach(o => {
      o.addEventListener('click', e => {
        if (e.target === o) { closeSheet(o.id); _resetPriceSheet(); }
      });
    });

    // ── Confirm dialog background tap ──
    document.getElementById('confirm-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('confirm-overlay')) closeConfirm();
    });

    // ── Back link to index ──
    document.getElementById('btn-back-to-home').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    // ── Confirm cancel button ──
    document.getElementById('btn-confirm-cancel').addEventListener('click', closeConfirm);
  }

  // ─────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  return { init };

})();
