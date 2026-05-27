// ═══════════════════════════════════════════════════
// Arkana App — Project Manager
// ProjectApp IIFE — zero globals except export.
// Load order: 5th (after app.js)
// ═══════════════════════════════════════════════════

const ProjectApp = (() => {

  // ─────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────
  let _projects   = [];   // full list from cache/API
  let _expenses   = [];   // for expense count per project
  let _editingId  = null; // project id being edited, null = new
  let _detailId   = null; // project id shown in detail sheet
  let _filter     = 'all';

  const CACHE_KEY_PROJECTS  = 'projects';
  const CACHE_KEY_EXPENSES  = 'expenses';

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────
  function init() {
    if (!_requireAuth()) return;
    _bindEvents();
    _populateUnitSelect();
    _loadData();

    // Pull to refresh — uses _fetchFresh() which is truly awaitable.
    // Unlike _loadData() (stale-while-revalidate, returns immediately),
    // _fetchFresh() awaits the API call — PTR indicator stays visible
    // until data arrives, giving the user clear loading feedback.
    initPullToRefresh(document.getElementById('pm-list'), _fetchFresh);
  }

  function _requireAuth() {
    const user = getUser();
    if (!user || !user.id) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  // ─────────────────────────────────────────
  // DATA LOADING — stale-while-revalidate
  // ─────────────────────────────────────────
  function _loadData() {
    // Load projects
    loadWithCache(
      'getProjects', {}, CACHE_KEY_PROJECTS,
      (result, isStale) => {
        _projects = result.projects || [];
        _renderList();
        if (isStale) _updateSub('Memperbarui...');
      },
      (err) => {
        showToast('Gagal memuat proyek', 'error');
        console.error(err);
      }
    );

    // Load expenses silently for count display
    loadWithCache(
      'getExpenses', {}, CACHE_KEY_EXPENSES,
      (result) => {
        _expenses = result.expenses || [];
        _renderList(); // re-render with counts
      },
      () => {} // silent fail — counts just won't show
    );
  }

  // True async fetch — awaits API completion before returning.
  // Used by PTR so the indicator stays visible during the full
  // network round-trip. Contrast with _loadData() which returns
  // immediately (stale-while-revalidate) and is used on page init.
  async function _fetchFresh() {
    try {
      const [projResult, expResult] = await Promise.all([
        api('getProjects', {}),
        api('getExpenses', {})
      ]);
      _projects = projResult.projects || [];
      _expenses = expResult.expenses || [];
      saveToCache(projResult, CACHE_KEY_PROJECTS);
      saveToCache(expResult, CACHE_KEY_EXPENSES);
      _renderList();
    } catch (err) {
      showToast('Gagal memuat data', 'error');
      console.error(err);
    }
  }

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  function _renderList() {
    const list = document.getElementById('pm-list');

    const filtered = _filter === 'all'
      ? _projects
      : _projects.filter(p => p.status === _filter);

    _updateSub(`${_projects.filter(p => p.status === PROJECT_STATUS.ACTIVE).length} aktif · ${_projects.filter(p => p.status === PROJECT_STATUS.CLOSED).length} selesai`);

    if (!filtered.length) {
      list.innerHTML = UI.emptyState('📁', _filter === 'all' ? 'Belum ada proyek.<br>Tap + untuk menambahkan proyek baru.' : 'Tidak ada proyek dengan filter ini.');
      return;
    }

    // Sort newest first within each group
    const sortByDate = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    const active = filtered.filter(p => p.status === PROJECT_STATUS.ACTIVE).sort(sortByDate);
    const closed = filtered.filter(p => p.status === PROJECT_STATUS.CLOSED).sort(sortByDate);

    let html = '';

    if (active.length) {
      if (_filter === 'all') html += `<div class="group-label">Aktif</div>`;
      active.forEach(p => { html += UI.card.project(p); });
    }

    if (closed.length) {
      if (_filter === 'all') html += `<div class="group-label">Selesai</div>`;
      closed.forEach(p => { html += UI.card.project(p); });
    }

    list.innerHTML = html;

    // Bind card taps
    list.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => _openDetail(card.dataset.id));
    });
  }

  function _cardHTML(p) {
    const statusClass = p.status === PROJECT_STATUS.ACTIVE ? 'status-active' : 'status-closed';
    const statusLabel = p.status === PROJECT_STATUS.ACTIVE ? 'Aktif' : 'Selesai';
    const unit = p.unitBisnis || '—';

    return `
      <div class="project-card ${p.status === PROJECT_STATUS.CLOSED ? 'closed' : ''}" data-id="${p.id}">
        <div class="card-stripe"></div>
        <div class="card-body">
          <div class="card-name">${_esc(p.nama)}</div>
          <div class="card-meta">
            <span class="card-unit">${_esc(unit)}</span>
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>
        </div>
        <div class="card-arrow">›</div>
      </div>`;
  }

  function _updateSub(text) {
    // PRD-00.4-B: sub-label removed from topbar design
  }

  // ─────────────────────────────────────────
  // DETAIL SHEET
  // ─────────────────────────────────────────
  function _openDetail(id) {
    const p = _projects.find(x => x.id === id);
    if (!p) return;
    _detailId = id;

    document.getElementById('detail-name').textContent = p.nama;

    document.getElementById('detail-meta').innerHTML = `
      <span class="card-unit">${_esc(p.unitBisnis || '—')}</span>
      ${UI.badge.status(p.status)}`;

    // Expense count for this project
    const expCount = _expenses.filter(e => e.projectId === id).length;
    document.getElementById('detail-stats').innerHTML = `
      <div class="stat-item">
        <div class="stat-num">${expCount}</div>
        <div class="stat-label">Pengeluaran</div>
      </div>`;

    // Toggle button label
    const toggleBtn = document.getElementById('btn-detail-toggle');
    if (p.status === PROJECT_STATUS.ACTIVE) {
      toggleBtn.textContent = '⏸ Tutup Proyek';
    } else {
      toggleBtn.textContent = '▶ Buka Kembali';
    }

    _showOverlay('overlay-detail');
  }

  // ─────────────────────────────────────────
  // ADD / EDIT SHEET
  // ─────────────────────────────────────────
  function _openAddSheet() {
    _editingId = null;
    document.getElementById('sheet-project-title').textContent = 'Proyek Baru';
    document.getElementById('input-nama').value = '';
    document.getElementById('input-unit').selectedIndex = 0;
    document.getElementById('input-status').value = PROJECT_STATUS.ACTIVE;
    _showOverlay('overlay-project');
    setTimeout(() => document.getElementById('input-nama').focus(), 350);
  }

  function _openEditSheet(id) {
    const p = _projects.find(x => x.id === id);
    if (!p) return;
    _editingId = id;
    document.getElementById('sheet-project-title').textContent = 'Edit Proyek';
    document.getElementById('input-nama').value = p.nama || '';
    document.getElementById('input-unit').value = p.unitBisnis || '';
    document.getElementById('input-status').value = p.status || PROJECT_STATUS.ACTIVE;
    _hideOverlay('overlay-detail');
    _showOverlay('overlay-project');
    setTimeout(() => document.getElementById('input-nama').focus(), 350);
  }

  function _populateUnitSelect() {
    // Units sourced from defaultUnits — loaded from getAll or hardcoded fallback
    const units = [
      'IT & Elektronik','Alat Medis','ATK & Kantor','Logistik',
      'Energi','Furnitur','Konstruksi','F&B','Umum'
    ];
    const sel = document.getElementById('input-unit');
    sel.innerHTML = units.map(u => `<option value="${u}">${u}</option>`).join('');
  }

  // ─────────────────────────────────────────
  // SAVE (add / update)
  // ─────────────────────────────────────────
  async function _saveProject() {
    const nama   = document.getElementById('input-nama').value.trim();
    const unit   = document.getElementById('input-unit').value;
    const status = document.getElementById('input-status').value;

    if (!nama) {
      showToast('Nama proyek wajib diisi', 'error');
      document.getElementById('input-nama').focus();
      return;
    }

    _hideOverlay('overlay-project');
    await new Promise(r => setTimeout(r, 200));
    showLoading('Menyimpan...');

    try {
      if (_editingId) {
        // Update
        const existing = _projects.find(p => p.id === _editingId);
        const updated = { ...existing, nama, unitBisnis: unit, status };
        await api('updateProject', updated);
        const idx = _projects.findIndex(p => p.id === _editingId);
        _projects[idx] = updated;
        saveToCache({ projects: _projects }, CACHE_KEY_PROJECTS);
        logActivity('update_project', `Proyek diperbarui: ${nama}`);
        showToast('Proyek diperbarui', 'success');
      } else {
        // Add
        const user = getUser();
        const newProject = {
          id:         'prj_' + Date.now(),
          nama,
          unitBisnis: unit,
          status,
          createdBy:  user.id,
          createdAt:  new Date().toISOString()
        };
        await api('addProject', newProject);
        _projects.unshift(newProject);
        _projects.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        saveToCache({ projects: _projects }, CACHE_KEY_PROJECTS);
        logActivity('add_project', `Proyek baru: ${nama}`);
        showToast('Proyek ditambahkan', 'success');
      }

      _renderList();
    } catch (err) {
      showToast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ─────────────────────────────────────────
  // TOGGLE STATUS (close / reopen)
  // ─────────────────────────────────────────
  async function _toggleStatus() {
    const p = _projects.find(x => x.id === _detailId);
    if (!p) return;

    const newStatus = p.status === PROJECT_STATUS.ACTIVE
      ? PROJECT_STATUS.CLOSED
      : PROJECT_STATUS.ACTIVE;

    showLoading('Memperbarui status...');
    try {
      const updated = { ...p, status: newStatus };
      await api('updateProject', updated);
      const idx = _projects.findIndex(x => x.id === _detailId);
      _projects[idx] = updated;
      saveToCache({ projects: _projects }, CACHE_KEY_PROJECTS);

      const label = newStatus === PROJECT_STATUS.ACTIVE ? 'dibuka kembali' : 'ditutup';
      logActivity('update_project', `Proyek ${label}: ${p.nama}`);
      showToast(`Proyek ${label}`, 'success');
      _hideOverlay('overlay-detail');
      _renderList();
    } catch (err) {
      showToast('Gagal memperbarui: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ─────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────
  function _confirmDelete() {
    const p = _projects.find(x => x.id === _detailId);
    if (!p) return;

    const expCount = _expenses.filter(e => e.projectId === _detailId).length;
    const warningMsg = expCount > 0
      ? `Proyek "<strong>${_esc(p.nama)}</strong>" memiliki <strong>${expCount} pengeluaran</strong> terkait. Data pengeluaran tidak akan terhapus, tapi tidak bisa difilter ke proyek ini lagi.`
      : `Proyek "<strong>${_esc(p.nama)}</strong>" akan dihapus permanen.`;

    document.getElementById('confirm-msg').innerHTML = warningMsg;
    document.getElementById('confirm-title').textContent = 'Hapus Proyek?';
    document.getElementById('confirm-overlay').classList.add('active');
  }

  async function _deleteProject() {
    document.getElementById('confirm-overlay').classList.remove('active');
    const p = _projects.find(x => x.id === _detailId);
    if (!p) return;

    showLoading('Menghapus...');
    try {
      await api('deleteProject', { id: _detailId });
      _projects = _projects.filter(x => x.id !== _detailId);
      saveToCache({ projects: _projects }, CACHE_KEY_PROJECTS);
      logActivity('delete_project', `Proyek dihapus: ${p.nama}`);
      showToast('Proyek dihapus', 'success');
      _hideOverlay('overlay-detail');
      _renderList();
    } catch (err) {
      showToast('Gagal menghapus: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
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
    // Back to home
    document.getElementById('btn-back')
      .addEventListener('click', () => window.location.href = 'index.html');

    // FAB — open add sheet
    document.getElementById('btn-fab')
      .addEventListener('click', _openAddSheet);

    // Sheet: cancel & save
    document.getElementById('btn-sheet-cancel')
      .addEventListener('click', () => _hideOverlay('overlay-project'));
    document.getElementById('btn-sheet-save')
      .addEventListener('click', _saveProject);

    // Close sheet on backdrop tap
    document.getElementById('overlay-project')
      .addEventListener('click', (e) => {
        if (e.target === e.currentTarget) _hideOverlay('overlay-project');
      });

    // Detail sheet actions
    document.getElementById('btn-detail-edit')
      .addEventListener('click', () => _openEditSheet(_detailId));
    document.getElementById('btn-detail-toggle')
      .addEventListener('click', _toggleStatus);
    document.getElementById('btn-detail-delete')
      .addEventListener('click', _confirmDelete);

    // Close detail on backdrop tap
    document.getElementById('overlay-detail')
      .addEventListener('click', (e) => {
        if (e.target === e.currentTarget) _hideOverlay('overlay-detail');
      });

    // Confirm dialog
    document.getElementById('confirm-cancel')
      .addEventListener('click', () => {
        document.getElementById('confirm-overlay').classList.remove('active');
      });
    document.getElementById('confirm-ok')
      .addEventListener('click', _deleteProject);

    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        _filter = chip.dataset.filter;
        _renderList();
      });
    });
  }

  // ─────────────────────────────────────────
  // UTILS
  // ─────────────────────────────────────────
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
