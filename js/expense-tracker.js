// ═══════════════════════════════════════════════════
// Arkana App — Expense Tracker
// ExpenseApp IIFE — zero globals except export.
// Load order: 5th (after app.js)
// ═══════════════════════════════════════════════════

const ExpenseApp = (() => {

  // ─────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────
  let _expenses  = [];
  let _projects  = [];
  let _editingId = null;
  let _detailId  = null;
  let _activeTab = EXPENSE_TAB.PENGELUARAN;

  // Active filters
  let _fBulan  = '';
  let _fTipe   = '';
  let _fMetode = '';

  const CACHE_KEY_EXPENSES = 'expenses';
  const CACHE_KEY_PROJECTS = 'projects';

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────
  function init() {
    if (!_requireAuth()) return;
    _setDefaultDate();
    _populateKategoriSelect();
    _bindEvents();
    _loadData();

    // Pull to refresh — uses _fetchFresh() which is truly awaitable.
    // Unlike _loadData() (stale-while-revalidate, returns immediately),
    // _fetchFresh() awaits the API call — PTR indicator stays visible
    // until data arrives, giving the user clear loading feedback.
    initPullToRefresh(document.getElementById('scroll-main'), _fetchFresh);
  }

  function _requireAuth() {
    const user = getUser();
    if (!user || !user.id) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  function _setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('f-tanggal').value = today;
  }

  // ─────────────────────────────────────────
  // DATA LOADING
  // ─────────────────────────────────────────
  function _loadData() {
    // Show loading overlay only when cache is empty (first load)
    const cached = loadFromCache(CACHE_KEY_EXPENSES);
    if (!cached) showLoading('Memuat data...');

    // Load expenses — stale-while-revalidate
    loadWithCache(
      'getExpenses', {}, CACHE_KEY_EXPENSES,
      (result, isStale) => {
        _expenses = result.expenses || [];
        _buildMonthFilter();
        _renderExpenses();
        _renderRingkasan();
        hideLoading();
        if (isStale) _updateSub('Memperbarui...');
        else _updateSub(_summaryLine());
      },
      (err) => {
        hideLoading();
        showToast('Gagal memuat data', 'error');
        console.error(err);
      }
    );

    // Load projects for dropdown
    loadWithCache(
      'getProjects', {}, CACHE_KEY_PROJECTS,
      (result) => {
        _projects = (result.projects || []).filter(p => p.status === PROJECT_STATUS.ACTIVE);
        _populateProyekSelect();
      },
      () => {}
    );
  }

  // True async fetch — awaits API completion before returning.
  // Used by PTR so the indicator stays visible during the full
  // network round-trip. Contrast with _loadData() which returns
  // immediately (stale-while-revalidate) and is used on page init.
  async function _fetchFresh() {
    try {
      const [expResult, projResult] = await Promise.all([
        api('getExpenses', {}),
        api('getProjects', {})
      ]);
      _expenses = expResult.expenses || [];
      _projects = (projResult.projects || []).filter(p => p.status === PROJECT_STATUS.ACTIVE);
      saveToCache(expResult, CACHE_KEY_EXPENSES);
      saveToCache(projResult, CACHE_KEY_PROJECTS);
      _buildMonthFilter();
      _renderExpenses();
      _renderRingkasan();
      _populateProyekSelect();
      _updateSub(_summaryLine());
    } catch (err) {
      showToast('Gagal memuat data', 'error');
      console.error(err);
    }
  }

  function _summaryLine() {
    const total = _expenses.reduce((s, e) => s + (parseFloat(e.jumlah) || 0), 0);
    return `${_expenses.length} entri · ${_fmtRp(total)}`;
  }

  function _updateSub(text) {
    // PRD-00.4-B: sub-label removed from topbar design
  }

  // ─────────────────────────────────────────
  // MONTH FILTER — built from expense data
  // ─────────────────────────────────────────
  function _buildMonthFilter() {
    const months = new Set();
    _expenses.forEach(e => {
      if (e.tanggal) months.add(String(e.tanggal).slice(0, 7)); // YYYY-MM
    });

    const wrap = document.getElementById('filter-bulan-wrap');
    const sorted = [...months].sort().reverse();
    const chips = [`<button class="filter-chip ${_fBulan === '' ? 'active' : ''}" data-bulan="">Semua</button>`];
    sorted.forEach(m => {
      const [y, mo] = m.split('-');
      const label = `${_monthName(parseInt(mo))} ${y}`;
      chips.push(`<button class="filter-chip ${_fBulan === m ? 'active' : ''}" data-bulan="${m}">${label}</button>`);
    });
    wrap.innerHTML = chips.join('');

    wrap.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        _fBulan = chip.dataset.bulan;
        wrap.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        _renderExpenses();
        _renderRingkasan();
      });
    });
  }

  function _monthName(n) {
    return ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'][n - 1] || '';
  }

  // ─────────────────────────────────────────
  // RENDER — EXPENSE LIST
  // ─────────────────────────────────────────
  function _filteredExpenses() {
    return _expenses.filter(e => {
      if (_fBulan && !String(e.tanggal || '').startsWith(_fBulan)) return false;
      if (_fTipe  && e.tipe !== _fTipe)     return false;
      if (_fMetode && e.metodePembayaran !== _fMetode) return false;
      return true;
    });
  }

  function _renderExpenses() {
    const list = document.getElementById('list-expenses');
    const filtered = _filteredExpenses();

    if (!filtered.length) {
      list.innerHTML = UI.emptyState("💸", "Belum ada pengeluaran.<br>Tap + untuk mencatat pengeluaran baru.");
      return;
    }

    // Sort: newest date first, then newest createdAt as tiebreaker
    const sorted = [...filtered].sort((a, b) => {
      const dateDiff = new Date(b.tanggal || 0) - new Date(a.tanggal || 0);
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    list.innerHTML = sorted.map(e => UI.card.expense(e, _projects)).join('');

    list.querySelectorAll('.expense-card').forEach(card => {
      card.addEventListener('click', () => _openDetail(card.dataset.id));
    });
  }

  function _cardHTML(e) {
    const metodeBadge = UI.badge.metode(e.metodePembayaran);
    const proj = e.tipe === EXPENSE_TYPE.PROYEK
      ? _projects.find(p => p.id === e.projectId)
      : null;

    const reimburseTag = (e.metodePembayaran === METODE_BAYAR.PERSONAL && e.perluReimburse === REIMBURSE.YA)
      ? `<span class="badge badge-reimburse">↩ Reimburse</span>`
      : '';

    const projTag = proj
      ? `<span class="badge badge-proyek">📁 ${_esc(proj.nama)}</span>`
      : (e.tipe === EXPENSE_TYPE.PROYEK ? `<span class="badge badge-proyek">📁 Proyek</span>` : '');

    const kategoriLabel = e.kategori === KATEGORI_LAINNYA && e.customKategori
      ? _esc(e.customKategori)
      : _esc(e.kategori || '—');

    return `
      <div class="expense-card" data-id="${e.id}">
        <div class="card-top">
          <div class="card-left">
            <div class="card-desc">${_esc(e.deskripsi || '(tanpa deskripsi)')}</div>
            <div class="card-date">${_fmtDate(e.tanggal)}</div>
          </div>
          <div class="card-amount">${_fmtRp(e.jumlah)}</div>
        </div>
        <div class="card-bottom">
          <span class="badge badge-kategori">${kategoriLabel}</span>
          ${metodeBadge}
          ${reimburseTag}
          ${projTag}
        </div>
      </div>`;
  }

  function _metodeBadge(metode) {
    if (metode === METODE_BAYAR.KAS_PERUSAHAAN)
      return `<span class="badge badge-kas">🏦 Kas Perusahaan</span>`;
    if (metode === METODE_BAYAR.PERSONAL)
      return `<span class="badge badge-personal">👤 Personal</span>`;
    if (metode === METODE_BAYAR.VENDOR_PAYLATER)
      return `<span class="badge badge-paylater">⏳ Vendor Paylater</span>`;
    return '';
  }

  // ─────────────────────────────────────────
  // RENDER — RINGKASAN
  // ─────────────────────────────────────────
  function _renderRingkasan() {
    const container = document.getElementById('ringkasan-content');
    const expenses  = _filteredExpenses();

    if (!expenses.length) {
      container.innerHTML = UI.emptyState("📊", "Belum ada data untuk ditampilkan.");
      return;
    }

    const total    = expenses.reduce((s, e) => s + (parseFloat(e.jumlah) || 0), 0);
    const now      = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const lastMonth = (() => {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    })();

    const totalThisMonth = _expenses
      .filter(e => String(e.tanggal || '').startsWith(thisMonth))
      .reduce((s, e) => s + (parseFloat(e.jumlah) || 0), 0);
    const totalLastMonth = _expenses
      .filter(e => String(e.tanggal || '').startsWith(lastMonth))
      .reduce((s, e) => s + (parseFloat(e.jumlah) || 0), 0);

    // ── Totals row ──
    let html = `
      <div class="summary-section">
        <div class="summary-totals">
          <div class="summary-total-card">
            <div class="summary-total-num">${_fmtRpShort(totalThisMonth)}</div>
            <div class="summary-total-label">Bulan Ini</div>
          </div>
          <div class="summary-total-card">
            <div class="summary-total-num">${_fmtRpShort(totalLastMonth)}</div>
            <div class="summary-total-label">Bulan Lalu</div>
          </div>
          <div class="summary-total-card">
            <div class="summary-total-num">${_fmtRpShort(total)}</div>
            <div class="summary-total-label">Total Filter</div>
          </div>
        </div>
      </div>`;

    // ── By Kategori ──
    html += _breakdownSection('Per Kategori', expenses, e => {
      return e.kategori === KATEGORI_LAINNYA && e.customKategori
        ? e.customKategori : (e.kategori || 'Lain-lain');
    });

    // ── By Metode ──
    html += _breakdownSection('Per Metode Pembayaran', expenses, e =>
      METODE_BAYAR_LABEL[e.metodePembayaran] || e.metodePembayaran || '—'
    );

    // ── By Proyek ──
    const proyekExpenses = expenses.filter(e => e.tipe === EXPENSE_TYPE.PROYEK);
    if (proyekExpenses.length) {
      html += _breakdownSection('Per Proyek', proyekExpenses, e => {
        const proj = _projects.find(p => p.id === e.projectId);
        return proj ? proj.nama : (e.projectId || 'Proyek tidak dikenal');
      });
    }

    // ── Reimbursement Outstanding ──
    const reimburseItems = _expenses.filter(e =>
      e.metodePembayaran === METODE_BAYAR.PERSONAL &&
      e.perluReimburse === REIMBURSE.YA &&
      e.dibayarOleh
    );
    if (reimburseItems.length) {
      const grouped = _groupBy(reimburseItems, e => e.dibayarOleh);
      const grandTotal = reimburseItems.reduce((s, e) => s + (parseFloat(e.jumlah) || 0), 0);
      html += `<div class="summary-section">
        <div class="summary-section-title">⚠️ Reimburse Outstanding</div>
        <div class="reimburse-grand-total">
          <span>Total perlu direimburse</span>
          <span>${_fmtRp(grandTotal)}</span>
        </div>`;
      Object.entries(grouped).forEach(([nama, items]) => {
        const subtotal = items.reduce((s, e) => s + (parseFloat(e.jumlah) || 0), 0);
        html += `
          <div class="reimburse-card">
            <div class="summary-row">
              <span class="summary-row-label">👤 ${_esc(nama)}</span>
              <span class="summary-row-value">${_fmtRp(subtotal)}</span>
            </div>
            ${items.map(e => `
              <div class="summary-row" style="padding-left:28px;">
                <div>
                  <div class="summary-row-label" style="font-size:12px;font-weight:500;text-transform:none;letter-spacing:0;color:var(--text2)">${_esc(e.deskripsi || '—')}</div>
                  <div class="summary-row-sub">${_fmtDate(e.tanggal)}</div>
                </div>
                <span class="summary-row-value" style="font-size:12px;">${_fmtRp(e.jumlah)}</span>
              </div>`).join('')}
          </div>`;
      });
      html += `</div>`;
    }

    // ── Vendor Paylater Outstanding ──
    const paylaterItems = _expenses.filter(e =>
      e.metodePembayaran === METODE_BAYAR.VENDOR_PAYLATER &&
      e.vendorPayStatus !== VENDOR_PAY_STATUS.LUNAS &&
      e.vendor
    );
    if (paylaterItems.length) {
      const grouped = _groupBy(paylaterItems, e => e.vendor);
      html += `<div class="summary-section">
        <div class="summary-section-title">⏳ Vendor Paylater Belum Lunas</div>`;
      Object.entries(grouped).forEach(([vendor, items]) => {
        const subtotal = items.reduce((s, e) => s + (parseFloat(e.jumlah) || 0), 0);
        html += `
          <div class="paylater-card">
            <div class="summary-row">
              <span class="summary-row-label">🏪 ${_esc(vendor)}</span>
              <span class="summary-row-value">${_fmtRp(subtotal)}</span>
            </div>
            ${items.map(e => `
              <div class="summary-row" style="padding-left:28px;">
                <div>
                  <div class="summary-row-label" style="font-size:12px;font-weight:500;text-transform:none;letter-spacing:0;color:var(--text2)">${_esc(e.deskripsi || '—')}</div>
                  <div class="summary-row-sub">${_fmtDate(e.tanggal)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="summary-row-value" style="font-size:12px;">${_fmtRp(e.jumlah)}</span>
                  <button class="btn-lunas" data-id="${e.id}">Lunas</button>
                </div>
              </div>`).join('')}
          </div>`;
      });
      html += `</div>`;
    }

    container.innerHTML = html;

    // Bind lunas buttons
    container.querySelectorAll('.btn-lunas').forEach(btn => {
      btn.addEventListener('click', () => _markLunas(btn.dataset.id));
    });
  }

  function _breakdownSection(title, expenses, keyFn) {
    const grouped = _groupBy(expenses, keyFn);
    const rows = Object.entries(grouped)
      .map(([key, items]) => ({
        key,
        total: items.reduce((s, e) => s + (parseFloat(e.jumlah) || 0), 0),
        count: items.length
      }))
      .sort((a, b) => b.total - a.total);

    return `
      <div class="summary-section">
        <div class="summary-section-title">${title}</div>
        <div class="summary-list">
          ${rows.map(r => `
            <div class="summary-row">
              <div>
                <div class="summary-row-label">${_esc(r.key)}</div>
                <div class="summary-row-sub">${r.count} entri</div>
              </div>
              <span class="summary-row-value">${_fmtRp(r.total)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ─────────────────────────────────────────
  // DETAIL SHEET
  // ─────────────────────────────────────────
  function _openDetail(id) {
    const e = _expenses.find(x => x.id === id);
    if (!e) return;
    _detailId = id;

    document.getElementById('detail-desc').textContent = e.deskripsi || '(tanpa deskripsi)';
    document.getElementById('detail-amount').textContent = _fmtRp(e.jumlah);

    const metodeBadge = UI.badge.metode(e.metodePembayaran);
    const reimburseTag = (e.metodePembayaran === METODE_BAYAR.PERSONAL && e.perluReimburse === REIMBURSE.YA)
      ? `<span class="badge badge-reimburse">↩ Reimburse</span>` : '';
    document.getElementById('detail-badges').innerHTML = metodeBadge + reimburseTag;

    const proj = _projects.find(p => p.id === e.projectId);
    const kategoriLabel = e.kategori === KATEGORI_LAINNYA && e.customKategori
      ? e.customKategori : (e.kategori || '—');

    const rows = [
      ['Tanggal',    _fmtDate(e.tanggal)],
      ['Kategori',   kategoriLabel],
      ['Tipe',       e.tipe === EXPENSE_TYPE.PROYEK ? 'Proyek' : 'Umum'],
      proj ? ['Proyek', proj.nama] : null,
      e.vendor ? ['Vendor', e.vendor] : null,
      e.dibayarOleh ? ['Dibayar Oleh', e.dibayarOleh] : null,
      e.metodePembayaran === METODE_BAYAR.VENDOR_PAYLATER
        ? ['Status Vendor', e.vendorPayStatus === VENDOR_PAY_STATUS.LUNAS ? '✅ Lunas' : '⏳ Belum Lunas']
        : null,
      ['Dicatat Oleh', e.createdBy || '—'],
    ].filter(Boolean);

    document.getElementById('detail-rows').innerHTML = rows.map(([label, val]) => `
      <div class="detail-row">
        <span class="detail-row-label">${label}</span>
        <span class="detail-row-value">${_esc(String(val))}</span>
      </div>`).join('');

    _showOverlay('overlay-detail');
  }

  // ─────────────────────────────────────────
  // ADD / EDIT SHEET
  // ─────────────────────────────────────────
  function _openAddSheet() {
    _editingId = null;
    document.getElementById('sheet-expense-title').textContent = 'Pengeluaran Baru';
    _resetForm();
    _showOverlay('overlay-expense');
  }

  function _openEditSheet(id) {
    const e = _expenses.find(x => x.id === id);
    if (!e) return;
    _editingId = id;
    document.getElementById('sheet-expense-title').textContent = 'Edit Pengeluaran';

    document.getElementById('f-tanggal').value   = e.tanggal || '';
    document.getElementById('f-tipe').value      = e.tipe || EXPENSE_TYPE.UMUM;
    document.getElementById('f-deskripsi').value = e.deskripsi || '';
    document.getElementById('f-vendor').value    = e.vendor || '';
    document.getElementById('f-jumlah').value    = e.jumlah ? _fmtRp(e.jumlah) : '';
    document.getElementById('f-metode').value    = e.metodePembayaran || METODE_BAYAR.KAS_PERUSAHAAN;
    document.getElementById('f-dibayar').value   = e.dibayarOleh || '';
    document.getElementById('f-reimburse').checked = e.perluReimburse === REIMBURSE.YA;

    // Kategori
    const katVal = KATEGORI_EXPENSE_FLAT.includes(e.kategori) ? e.kategori : KATEGORI_LAINNYA;
    document.getElementById('f-kategori').value = katVal;
    document.getElementById('f-custom-kategori').value = e.customKategori || '';

    _onTipeChange();
    _onMetodeChange();
    _onKategoriChange();

    // Set proyek after DOM update
    setTimeout(() => {
      if (e.tipe === EXPENSE_TYPE.PROYEK) {
        document.getElementById('f-proyek').value = e.projectId || '';
      }
    }, 50);

    _hideOverlay('overlay-detail');
    _showOverlay('overlay-expense');
  }

  function _resetForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('f-tanggal').value = today;
    document.getElementById('f-tipe').value    = EXPENSE_TYPE.UMUM;
    document.getElementById('f-kategori').value = '';
    document.getElementById('f-custom-kategori').value = '';
    document.getElementById('f-deskripsi').value = '';
    document.getElementById('f-vendor').value   = '';
    document.getElementById('f-jumlah').value   = '';
    document.getElementById('f-metode').value   = METODE_BAYAR.KAS_PERUSAHAAN;
    document.getElementById('f-reimburse').checked = false;
    document.getElementById('f-dibayar').value  = '';
    _onTipeChange();
    _onMetodeChange();
    _onKategoriChange();
  }

  function _populateKategoriSelect() {
    _filterKategoriByTipe(document.getElementById('f-tipe').value);
  }

  function _filterKategoriByTipe(tipe) {
    const sel = document.getElementById('f-kategori');
    const current = sel.value;
    let opts = `<option value="">Pilih kategori...</option>`;
    KATEGORI_EXPENSE.forEach(grup => {
      // Show Operasional Umum only for tipe=umum, Project only for tipe=proyek, Lainnya always
      if (grup.grup === 'Operasional Umum' && tipe === EXPENSE_TYPE.PROYEK) return;
      if (grup.grup === 'Project' && tipe === EXPENSE_TYPE.UMUM) return;
      opts += `<optgroup label="${grup.grup}">`;
      grup.items.forEach(item => {
        opts += `<option value="${item}">${item}</option>`;
      });
      opts += `</optgroup>`;
    });
    sel.innerHTML = opts;
    // Restore previous value if still valid
    if (current && sel.querySelector(`option[value="${current}"]`)) {
      sel.value = current;
    }
    _onKategoriChange();
  }

  function _populateProyekSelect() {
    const sel = document.getElementById('f-proyek');
    const current = sel.value;
    sel.innerHTML = `<option value="">Pilih proyek...</option>` +
      _projects.map(p => `<option value="${p.id}">${_esc(p.nama)}</option>`).join('');
    if (current) sel.value = current;
  }

  // ─────────────────────────────────────────
  // CONDITIONAL FIELD VISIBILITY
  // ─────────────────────────────────────────
  function _onTipeChange() {
    const tipe = document.getElementById('f-tipe').value;
    document.getElementById('group-proyek').style.display =
      tipe === EXPENSE_TYPE.PROYEK ? '' : 'none';
    _filterKategoriByTipe(tipe);
  }

  function _onMetodeChange() {
    const metode = document.getElementById('f-metode').value;
    const isPersonal = metode === METODE_BAYAR.PERSONAL;
    document.getElementById('group-reimburse').style.display = isPersonal ? '' : 'none';
    document.getElementById('group-dibayar').style.display   = isPersonal ? '' : 'none';
  }

  function _onKategoriChange() {
    const val = document.getElementById('f-kategori').value;
    document.getElementById('group-custom-kategori').style.display =
      val === KATEGORI_LAINNYA ? '' : 'none';
  }

  // ─────────────────────────────────────────
  // SAVE
  // ─────────────────────────────────────────
  async function _saveExpense() {
    const tanggal  = document.getElementById('f-tanggal').value;
    const tipe     = document.getElementById('f-tipe').value;
    const proyekId = document.getElementById('f-proyek').value;
    const kategori = document.getElementById('f-kategori').value;
    const customK  = document.getElementById('f-custom-kategori').value.trim();
    const deskripsi= document.getElementById('f-deskripsi').value.trim();
    const vendor   = document.getElementById('f-vendor').value.trim();
    const jumlahRaw= document.getElementById('f-jumlah').value.replace(/\D/g, '');
    const metode   = document.getElementById('f-metode').value;
    const reimburse= document.getElementById('f-reimburse').checked ? REIMBURSE.YA : REIMBURSE.TIDAK;
    const dibayar  = document.getElementById('f-dibayar').value.trim();

    // Validation
    if (!tanggal) { showToast('Tanggal wajib diisi', 'error'); return; }
    if (!kategori){ showToast('Kategori wajib dipilih', 'error'); return; }
    if (kategori === KATEGORI_LAINNYA && !customK) {
      showToast('Tulis kategori lainnya', 'error');
      document.getElementById('f-custom-kategori').focus();
      return;
    }
    if (!deskripsi){ showToast('Deskripsi wajib diisi', 'error'); return; }
    if (!jumlahRaw || jumlahRaw === '0') { showToast('Jumlah wajib diisi', 'error'); return; }
    if (tipe === EXPENSE_TYPE.PROYEK && !proyekId) {
      showToast('Pilih proyek', 'error'); return;
    }

    const user = getUser();
    const jumlah = parseFloat(jumlahRaw);

    // Auto-set vendorPayStatus for paylater
    const vendorPayStatus = metode === METODE_BAYAR.VENDOR_PAYLATER
      ? VENDOR_PAY_STATUS.BELUM : '';

    _hideOverlay('overlay-expense');
    await new Promise(r => setTimeout(r, 200));
    showLoading('Menyimpan...');

    try {
      if (_editingId) {
        const existing = _expenses.find(x => x.id === _editingId);
        const updated = {
          ...existing,
          tanggal, tipe, projectId: proyekId,
          kategori, customKategori: customK,
          deskripsi, vendor, jumlah, metodePembayaran: metode,
          perluReimburse: metode === METODE_BAYAR.PERSONAL ? reimburse : '',
          dibayarOleh: metode === METODE_BAYAR.PERSONAL ? dibayar : '',
          vendorPayStatus: metode === METODE_BAYAR.VENDOR_PAYLATER
            ? (existing.vendorPayStatus || VENDOR_PAY_STATUS.BELUM) : ''
        };
        await api('updateExpense', updated);
        const idx = _expenses.findIndex(x => x.id === _editingId);
        _expenses[idx] = updated;
        logActivity('update_expense', `Pengeluaran diperbarui: ${deskripsi} — ${_fmtRp(jumlah)}`);
        showToast('Pengeluaran diperbarui', 'success');
      } else {
        const newExp = {
          id:               'exp_' + Date.now(),
          tanggal, tipe,
          projectId:        proyekId,
          kategori,
          customKategori:   customK,
          deskripsi, vendor, jumlah,
          metodePembayaran: metode,
          perluReimburse:   metode === METODE_BAYAR.PERSONAL ? reimburse : '',
          dibayarOleh:      metode === METODE_BAYAR.PERSONAL ? dibayar : '',
          vendorPayStatus,
          createdBy:        user.id,
          createdAt:        new Date().toISOString()
        };
        await api('addExpense', newExp);
        _expenses.unshift(newExp);
        _expenses.sort((a, b) => {
          const d = new Date(b.tanggal || 0) - new Date(a.tanggal || 0);
          return d !== 0 ? d : new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
        logActivity('add_expense', `Pengeluaran baru: ${deskripsi} — ${_fmtRp(jumlah)}`);
        showToast('Pengeluaran disimpan', 'success');
      }

      saveToCache({ expenses: _expenses }, CACHE_KEY_EXPENSES);
      _buildMonthFilter();
      _renderExpenses();
      _renderRingkasan();
      _updateSub(_summaryLine());

    } catch (err) {
      showToast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ─────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────
  function _confirmDelete() {
    const e = _expenses.find(x => x.id === _detailId);
    if (!e) return;
    document.getElementById('confirm-msg').textContent =
      `"${e.deskripsi || 'Pengeluaran ini'}" (${_fmtRp(e.jumlah)}) akan dihapus permanen.`;
    document.getElementById('confirm-overlay').classList.add('active');
  }

  async function _deleteExpense() {
    document.getElementById('confirm-overlay').classList.remove('active');
    const e = _expenses.find(x => x.id === _detailId);
    if (!e) return;

    showLoading('Menghapus...');
    try {
      await api('deleteExpense', { id: _detailId });
      _expenses = _expenses.filter(x => x.id !== _detailId);
      saveToCache({ expenses: _expenses }, CACHE_KEY_EXPENSES);
      logActivity('delete_expense', `Pengeluaran dihapus: ${e.deskripsi}`);
      showToast('Pengeluaran dihapus', 'success');
      _hideOverlay('overlay-detail');
      _buildMonthFilter();
      _renderExpenses();
      _renderRingkasan();
      _updateSub(_summaryLine());
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ─────────────────────────────────────────
  // MARK VENDOR LUNAS
  // ─────────────────────────────────────────
  async function _markLunas(id) {
    const e = _expenses.find(x => x.id === id);
    if (!e) return;

    showLoading('Memperbarui...');
    try {
      await api('markVendorLunas', { id });
      const idx = _expenses.findIndex(x => x.id === id);
      _expenses[idx] = { ..._expenses[idx], vendorPayStatus: VENDOR_PAY_STATUS.LUNAS };
      saveToCache({ expenses: _expenses }, CACHE_KEY_EXPENSES);
      logActivity('vendor_lunas', `Vendor dilunasi: ${e.vendor} — ${_fmtRp(e.jumlah)}`);
      showToast('Vendor ditandai lunas ✓', 'success');
      _renderRingkasan();
    } catch (err) {
      showToast('Gagal: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ─────────────────────────────────────────
  // TAB SWITCHING
  // ─────────────────────────────────────────
  function _switchTab(tab) {
    _activeTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');

    document.getElementById('pane-pengeluaran').style.display =
      tab === EXPENSE_TAB.PENGELUARAN ? '' : 'none';
    document.getElementById('pane-ringkasan').style.display =
      tab === EXPENSE_TAB.RINGKASAN ? '' : 'none';

    // FAB only on pengeluaran tab
    document.getElementById('btn-fab').style.display =
      tab === EXPENSE_TAB.PENGELUARAN ? '' : 'none';

    if (tab === EXPENSE_TAB.RINGKASAN) _renderRingkasan();
  }

  // ─────────────────────────────────────────
  // OVERLAY HELPERS
  // ─────────────────────────────────────────
  function _showOverlay(id) {
    document.getElementById(id).classList.add('active');
  }

  function _hideOverlay(id) {
    document.getElementById(id).classList.remove('active');
  }

  // ─────────────────────────────────────────
  // BIND EVENTS
  // ─────────────────────────────────────────
  function _bindEvents() {
    // Back
    document.getElementById('btn-back')
      .addEventListener('click', () => window.location.href = 'index.html');

    // Tabs
    document.getElementById('tab-pengeluaran')
      .addEventListener('click', () => _switchTab(EXPENSE_TAB.PENGELUARAN));
    document.getElementById('tab-ringkasan')
      .addEventListener('click', () => _switchTab(EXPENSE_TAB.RINGKASAN));

    // FAB
    document.getElementById('btn-fab')
      .addEventListener('click', _openAddSheet);

    // Expense form: conditional fields
    document.getElementById('f-tipe')
      .addEventListener('change', _onTipeChange);
    document.getElementById('f-metode')
      .addEventListener('change', _onMetodeChange);
    document.getElementById('f-kategori')
      .addEventListener('change', _onKategoriChange);

    // Expense form: save & cancel
    document.getElementById('btn-expense-cancel')
      .addEventListener('click', () => _hideOverlay('overlay-expense'));
    document.getElementById('btn-expense-save')
      .addEventListener('click', _saveExpense);

    // Rp input formatting
    document.getElementById('f-jumlah')
      .addEventListener('input', _onJumlahInput);

    // Backdrop close
    document.getElementById('overlay-expense')
      .addEventListener('click', e => { if (e.target === e.currentTarget) _hideOverlay('overlay-expense'); });
    document.getElementById('overlay-detail')
      .addEventListener('click', e => { if (e.target === e.currentTarget) _hideOverlay('overlay-detail'); });

    // Detail actions
    document.getElementById('btn-detail-edit')
      .addEventListener('click', () => _openEditSheet(_detailId));
    document.getElementById('btn-detail-delete')
      .addEventListener('click', _confirmDelete);

    // Confirm dialog
    document.getElementById('confirm-cancel')
      .addEventListener('click', () => {
        document.getElementById('confirm-overlay').classList.remove('active');
      });
    document.getElementById('confirm-ok')
      .addEventListener('click', _deleteExpense);

    // Filter chips — tipe & metode (bulan chips are dynamic, bound in _buildMonthFilter)
    document.getElementById('filter-tipe-wrap').addEventListener('click', e => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#filter-tipe-wrap .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _fTipe = chip.dataset.tipe;
      _renderExpenses();
      _renderRingkasan();
    });

    document.getElementById('filter-metode-wrap').addEventListener('click', e => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#filter-metode-wrap .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _fMetode = chip.dataset.metode;
      _renderExpenses();
      _renderRingkasan();
    });
  }

  // ─────────────────────────────────────────
  // UTILS
  // ─────────────────────────────────────────
  function _onJumlahInput(e) {
    const raw   = e.target.value.replace(/\D/g, '');
    const num   = parseInt(raw, 10);
    e.target.value = raw ? 'Rp ' + num.toLocaleString('id-ID') : '';
  }

  function _fmtRp(val) {
    const num = parseFloat(val) || 0;
    return 'Rp ' + num.toLocaleString('id-ID');
  }

  function _fmtRpShort(val) {
    const num = parseFloat(val) || 0;
    if (num >= 1_000_000_000) return 'Rp ' + (num / 1_000_000_000).toFixed(1) + 'M';
    if (num >= 1_000_000)     return 'Rp ' + (num / 1_000_000).toFixed(1) + 'jt';
    if (num >= 1_000)         return 'Rp ' + (num / 1_000).toFixed(0) + 'rb';
    return 'Rp ' + num.toLocaleString('id-ID');
  }

  function _fmtDate(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    const days   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function _groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
      const key = keyFn(item) || '—';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }

  function _esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  return { reload: _loadData };

})();
