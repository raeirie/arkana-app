// ═══════════════════════════════════════════════════
// Arkana App — Index JS
// IndexApp IIFE: login, home, PIN modal, activity log.
// Consumes: constants.js, utils.js, app.js (shared).
// Load order: 5th (after app.js)
// ═══════════════════════════════════════════════════

const IndexApp = (() => {

  // ─────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────
  let selectedUser     = 'arie';
  let pinBuffer        = '';
  let currentScreen    = 'login';
  let modalStep        = 1;      // 1=verify old, 2=enter new, 3=confirm new
  let newPinTemp       = '';
  let modalPinBuffer   = '';
  let avatarUploadTarget = null;

  // Per-user localStorage key helpers (not in constants — index-specific)
  const AVATAR_KEY = (user) => `arkana_avatar_${user}`;
  const PIN_KEY    = (user) => `arkana_pin_${user}`;

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────
  async function init() {
    _initPINs();
    _loadAvatars();
    _setVersionStrings();
    _setHomeDate();
    _bindEvents();

    // Check existing session first — skip PIN sync wait if already logged in
    const session = getUser();
    if (session.id && USERS[session.id]) {
      loginSuccess(session.id, false); // false = session restore, don't log
      // Sync PINs in background after restoring session
      _syncPINsFromSheet();
      return;
    }

    // No session — sync PINs before showing login so latest PIN is available
    await _syncPINsFromSheet();
    showScreen('login');
  }

  // ─────────────────────────────────────────
  // INTERNAL SETUP HELPERS
  // ─────────────────────────────────────────
  function _initPINs() {
    if (!localStorage.getItem(PIN_KEY('arie'))) localStorage.setItem(PIN_KEY('arie'), '1234');
    if (!localStorage.getItem(PIN_KEY('ajin'))) localStorage.setItem(PIN_KEY('ajin'), '1234');
  }

  function _loadAvatars() {
    ['arie', 'ajin'].forEach(user => {
      const saved = localStorage.getItem(AVATAR_KEY(user));
      const el = document.getElementById('login-avatar-' + user);
      if (saved && el) {
        el.innerHTML = `<img src="${saved}" alt="${user}">`;
      }
    });
  }

  async function _syncPINsFromSheet() {
    try {
      const data = await api('getAll');
      const settings = data.db?.settings || {};
      // Only overwrite localStorage when it still holds the factory default.
      // A non-default local PIN means it was changed this session —
      // Sheet sync is fire-and-forget and may lag, so local wins.
      const DEFAULT = '1234';
      if (settings.pinArie && settings.pinArie.length === 4) {
        const local = localStorage.getItem(PIN_KEY('arie'));
        if (!local || local === DEFAULT)
          localStorage.setItem(PIN_KEY('arie'), settings.pinArie);
      }
      if (settings.pinAjin && settings.pinAjin.length === 4) {
        const local = localStorage.getItem(PIN_KEY('ajin'));
        if (!local || local === DEFAULT)
          localStorage.setItem(PIN_KEY('ajin'), settings.pinAjin);
      }
    } catch (e) {
      console.warn('[IndexApp] PIN sync failed, using local:', e.message);
    }
  }

  function _setVersionStrings() {
    const v = typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'v1.x';
    [
      { id: 'login-version',   text: v },
      { id: 'home-version',    text: v },
      { id: 'setting-version', text: v + ' · PRD-00.1b' }
    ].forEach(({ id, text }) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    });
  }

  function _setHomeDate() {
    const now = new Date();
    const days   = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                    'Agustus','September','Oktober','November','Desember'];
    const el = document.getElementById('home-date');
    if (el) el.textContent =
      `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }

  // ─────────────────────────────────────────
  // SCREEN
  // ─────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active', 'slide-out');
    });
    const target = document.getElementById('screen-' + id);
    if (target) {
      target.classList.add('active');
      currentScreen = id;
    }
  }

  function navTo(id) {
    if (id === currentScreen) return;
    if (id === 'aktivitas') {
      showScreen(id);
      renderActivityLog(); // show local cache immediately
      _syncActivityLog();  // then fetch from sheet
    } else {
      showScreen(id);
    }
    // Update nav indicators across all nav bars
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.nav === id);
    });
  }

  // ─────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────
  function selectUser(user) {
    selectedUser = user;
    pinBuffer = '';
    _updateLoginDots();
    _updateLoginEnterBtn();

    document.querySelectorAll('.user-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('card-' + user).classList.add('selected');

    document.querySelectorAll('.user-check').forEach(c => c.textContent = '');
    document.querySelector('#card-' + user + ' .user-check').textContent = '✓';

    document.getElementById('pin-label').textContent =
      `Masukkan PIN — ${USERS[user].name}`;
    document.getElementById('pin-section').classList.remove('error');
  }

  function pinPress(digit) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += digit;
    _updateLoginDots();
    _updateLoginEnterBtn();
    if (pinBuffer.length === 4) pinEnter();
  }

  function pinDel() {
    pinBuffer = pinBuffer.slice(0, -1);
    _updateLoginDots();
    _updateLoginEnterBtn();
  }

  async function pinEnter() {
    if (pinBuffer.length < 4) return;
    document.getElementById('pin-enter').classList.add('disabled');

    // localStorage is always the final gate.
    // This prevents a loose server-side validatePin (not filtering by user)
    // from accepting another user's PIN for the selected user.
    const stored = localStorage.getItem(PIN_KEY(selectedUser));
    const localValid = (pinBuffer === stored);

    try {
      const data = await api('validatePin', { user: selectedUser, pin: pinBuffer });
      if (data.valid && localValid) {
        // Both agree — clean login
        loginSuccess(selectedUser, true);
      } else if (!data.valid && localValid) {
        // Sheet lagging after a PIN change — trust localStorage
        loginSuccess(selectedUser, true);
      } else {
        // API valid but local disagrees (wrong user's PIN matched server),
        // or both invalid — reject
        pinError();
      }
    } catch (e) {
      // Network error — localStorage only
      if (localValid) {
        loginSuccess(selectedUser, true);
      } else {
        pinError();
      }
    } finally {
      document.getElementById('pin-enter').classList.remove('disabled');
    }
  }

  function pinError() {
    const section = document.getElementById('pin-section');
    section.classList.add('error');
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('dot-' + i);
      if (dot) dot.classList.add('error-dot');
    }
    setTimeout(() => {
      section.classList.remove('error');
      for (let i = 0; i < 4; i++) {
        const dot = document.getElementById('dot-' + i);
        if (dot) dot.classList.remove('error-dot');
      }
      pinBuffer = '';
      _updateLoginDots();
      _updateLoginEnterBtn();
    }, 900);
  }

  function loginSuccess(userId, fromPin = false) {
    const user = USERS[userId];
    setSession({ id: userId, name: user.name });

    document.getElementById('home-name').textContent = user.name;
    const photoUrl = localStorage.getItem(AVATAR_KEY(userId));
    updateStripAvatar(userId, photoUrl);
    document.getElementById('strip-name').textContent = user.name;

    if (fromPin) {
      logActivity('Login', `${user.name} masuk ke Arkana App`);
    }

    showScreen('home');
    // Reset nav indicators to home
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.nav === 'home');
    });

    pinBuffer = '';
    _updateLoginDots();
    _updateLoginEnterBtn();
  }

  function logout() {
    const session = getUser();
    if (session.id && USERS[session.id]) {
      logActivity('Logout', `${USERS[session.id].name} keluar dari Arkana App`);
    }
    clearSession();
    selectedUser = 'arie';
    selectUser('arie');
    showScreen('login');
  }

  // ─────────────────────────────────────────
  // AVATAR
  // ─────────────────────────────────────────
  function triggerAvatarUpload(e, user) {
    e.stopPropagation(); // don't bubble to selectUser
    avatarUploadTarget = user;
    const input = document.getElementById('avatar-file-input');
    input.value = '';
    input.click();
  }

  function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file || !avatarUploadTarget) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const dataUrl = ev.target.result;
      localStorage.setItem(AVATAR_KEY(avatarUploadTarget), dataUrl);
      // Update login card
      const el = document.getElementById('login-avatar-' + avatarUploadTarget);
      if (el) el.innerHTML = `<img src="${dataUrl}" alt="${avatarUploadTarget}">`;
      // Update strip if this is the active user
      const session = getUser();
      if (session.id === avatarUploadTarget) {
        updateStripAvatar(avatarUploadTarget, dataUrl);
      }
      showToast('Foto profil diperbarui ✓', 'success');
    };
    reader.readAsDataURL(file);
  }

  function updateStripAvatar(userId, photoUrl) {
    const sa = document.getElementById('strip-avatar');
    if (!sa) return;
    if (photoUrl) {
      sa.innerHTML = `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
      sa.style.background = 'none';
    } else {
      const user = USERS[userId];
      sa.textContent = user.avatar;
      sa.style.background = user.color;
    }
  }

  function openChangeAvatar() {
    const session = getUser();
    if (!session.id) return;
    avatarUploadTarget = session.id;
    const input = document.getElementById('avatar-file-input');
    input.value = '';
    input.click();
  }

  // ─────────────────────────────────────────
  // PIN MODAL
  // ─────────────────────────────────────────
  function openChangePIN() {
    modalPinBuffer = '';
    modalStep = 1;
    newPinTemp = '';
    document.getElementById('modal-title').textContent = 'Ganti PIN';
    document.getElementById('modal-sub').textContent = 'Masukkan PIN lama kamu';
    _updateModalDots();
    _updateModalEnterBtn();
    document.getElementById('modal-pin').classList.add('active');
  }

  function closeChangePIN() {
    document.getElementById('modal-pin').classList.remove('active');
    modalPinBuffer = '';
  }

  function modalPin(digit) {
    if (modalPinBuffer.length >= 4) return;
    modalPinBuffer += digit;
    _updateModalDots();
    _updateModalEnterBtn();
    if (modalPinBuffer.length === 4) modalEnter();
  }

  function modalDel() {
    modalPinBuffer = modalPinBuffer.slice(0, -1);
    _updateModalDots();
    _updateModalEnterBtn();
  }

  async function modalEnter() {
    if (modalPinBuffer.length < 4) return;
    const session = getUser();
    const userId = session.id;

    if (modalStep === 1) {
      // Verify old PIN — API first, localStorage fallback (same pattern as pinEnter)
      let valid = false;
      try {
        const data = await api('validatePin', { user: userId, pin: modalPinBuffer });
        if (data.valid) {
          valid = true;
        } else {
          // Sheet may lag after a PIN change — cross-check local
          valid = (modalPinBuffer === localStorage.getItem(PIN_KEY(userId)));
        }
      } catch (e) {
        valid = (modalPinBuffer === localStorage.getItem(PIN_KEY(userId)));
      }
      if (!valid) {
        showToast('PIN lama salah', 'error');
        _clearModalBuffer();
        return;
      }
      modalStep = 2;
      newPinTemp = '';
      modalPinBuffer = '';
      document.getElementById('modal-sub').textContent = 'Masukkan PIN baru (4 digit)';
      _updateModalDots();
      _updateModalEnterBtn();

    } else if (modalStep === 2) {
      newPinTemp = modalPinBuffer;
      modalStep = 3;
      modalPinBuffer = '';
      document.getElementById('modal-sub').textContent = 'Konfirmasi PIN baru';
      _updateModalDots();
      _updateModalEnterBtn();

    } else if (modalStep === 3) {
      if (modalPinBuffer !== newPinTemp) {
        showToast('PIN tidak cocok, ulangi', 'error');
        modalStep = 2;
        newPinTemp = '';
        modalPinBuffer = '';
        document.getElementById('modal-sub').textContent = 'Masukkan PIN baru (4 digit)';
        _updateModalDots();
        _updateModalEnterBtn();
        return;
      }
      // Save locally immediately
      localStorage.setItem(PIN_KEY(userId), newPinTemp);
      // Sync to Sheet (fire & forget)
      const pinField = userId === 'arie' ? 'pinArie' : 'pinAjin';
      api('updateSettings', { [pinField]: newPinTemp })
        .then(() => showToast('PIN berhasil diubah & disync ✓', 'success'))
        .catch(() => showToast('PIN diubah (offline, belum sync)', ''));
      logActivity('Ganti PIN', `${USERS[userId].name} mengubah PIN login`);
      closeChangePIN();
    }
  }

  // ─────────────────────────────────────────
  // ACTIVITY LOG
  // ─────────────────────────────────────────
  function renderActivityLog() {
    const logs = getActivityLog();
    const container = document.getElementById('aktivitas-content');
    if (!container) return;

    if (logs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🕐</div>
          <div class="empty-text">Belum ada aktivitas.<br>Log akan muncul saat data mulai diubah.</div>
        </div>`;
      return;
    }

    const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const items = logs.map(log => {
      const user = USERS[log.userId] || { name: log.userId, avatar: '?', color: '#1E2640' };
      const t = new Date(log.time);
      const timeStr = `${days[t.getDay()]} ${t.getDate()}/${t.getMonth()+1} · `
                    + `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`;
      return `
        <div class="log-item">
          <div class="log-avatar" style="background:${user.color}">${user.avatar}</div>
          <div class="log-body">
            <div class="log-action">${log.action}</div>
            <div class="log-detail">${log.detail}</div>
            <div class="log-time">${timeStr}</div>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="log-list">${items}</div>`;
  }

  async function _syncActivityLog() {
    try {
      const data = await api('getLogs');
      if (data.logs) {
        const nameToId = {};
        Object.entries(USERS).forEach(([id, u]) => { nameToId[u.name] = id; });
        const sheetLogs = data.logs.map(l => ({
          userId: nameToId[l.user] || l.user,
          action: l.action,
          detail: l.detail,
          time:   l.timestamp
        }));
        localStorage.setItem(STORAGE_KEY.LOG, JSON.stringify(sheetLogs));
        renderActivityLog();
      }
    } catch (e) {
      // Offline — local cache already displayed
    }
  }

  // ─────────────────────────────────────────
  // INTERNAL DOT / BUTTON HELPERS
  // ─────────────────────────────────────────
  function _updateLoginDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('dot-' + i);
      if (!dot) continue;
      dot.classList.toggle('filled', i < pinBuffer.length);
      dot.classList.remove('error-dot');
    }
  }

  function _updateLoginEnterBtn() {
    const btn = document.getElementById('pin-enter');
    if (btn) btn.classList.toggle('disabled', pinBuffer.length < 4);
  }

  function _updateModalDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById('mdot-' + i);
      if (dot) dot.classList.toggle('filled', i < modalPinBuffer.length);
    }
  }

  function _updateModalEnterBtn() {
    const btn = document.getElementById('modal-enter');
    if (btn) btn.classList.toggle('disabled', modalPinBuffer.length < 4);
  }

  function _clearModalBuffer() {
    modalPinBuffer = '';
    _updateModalDots();
    _updateModalEnterBtn();
  }

  // ─────────────────────────────────────────
  // EVENTS
  // All addEventListener bindings — zero inline onclick in HTML.
  // ─────────────────────────────────────────
  function _bindEvents() {
    // User selection cards
    document.getElementById('card-arie').addEventListener('click', () => selectUser('arie'));
    document.getElementById('card-ajin').addEventListener('click', () => selectUser('ajin'));

    // Avatar upload triggers on login cards
    document.getElementById('login-avatar-arie').addEventListener('click', (e) => triggerAvatarUpload(e, 'arie'));
    document.getElementById('login-avatar-ajin').addEventListener('click', (e) => triggerAvatarUpload(e, 'ajin'));
    document.getElementById('avatar-file-input').addEventListener('change', handleAvatarUpload);

    // PIN numpad (login)
    document.querySelectorAll('.pin-numpad .pin-key').forEach(key => {
      const text = key.textContent.trim();
      if (key.classList.contains('del')) {
        key.addEventListener('click', pinDel);
      } else if (key.classList.contains('enter')) {
        key.addEventListener('click', pinEnter);
      } else {
        key.addEventListener('click', () => pinPress(text));
      }
    });

    // Logout button
    document.querySelector('.logout-btn').addEventListener('click', logout);

    // Feature card navigation — generic, driven by data-nav-page attribute
    document.querySelectorAll('.feat-card[data-nav-page]').forEach(card => {
      card.addEventListener('click', () => {
        window.location.href = card.dataset.navPage;
      });
    });

    // Bottom nav (all nav bars — home, aktivitas, setting screens each have one)
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => navTo(item.dataset.nav));
    });

    // Setting items
    document.querySelector('[data-action="change-avatar"]')
      ?.addEventListener('click', openChangeAvatar);
    document.querySelector('[data-action="change-pin"]')
      ?.addEventListener('click', openChangePIN);

    // PIN modal numpad
    document.querySelectorAll('.modal-numpad .pin-key').forEach(key => {
      const text = key.textContent.trim();
      if (key.classList.contains('del')) {
        key.addEventListener('click', modalDel);
      } else if (key.classList.contains('enter')) {
        key.addEventListener('click', modalEnter);
      } else {
        key.addEventListener('click', () => modalPin(text));
      }
    });

    // Modal cancel button & backdrop click
    document.querySelector('.modal-btn.cancel')
      ?.addEventListener('click', closeChangePIN);
    document.getElementById('modal-pin').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-pin')) closeChangePIN();
    });
  }

  // ─────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────
  return { init };

})();

// Kick off
window.addEventListener('DOMContentLoaded', () => IndexApp.init());
