// ═══════════════════════════════════════════════════
// Arkana App — Constants
// Single source of truth for all enums & keys.
// No magic strings anywhere else in the codebase.
// Load order: 2nd (after config.js)
// ═══════════════════════════════════════════════════

// ─────────────────────────────────────────
// SUPPLIER TRACKER
// ─────────────────────────────────────────

const ITEM_TYPE = Object.freeze({
  PRODUK: 'produk',
  JASA:   'jasa'
});

const SUPPLIER_LEVEL = Object.freeze({
  L1:   'L1',
  L2:   'L2',
  L3:   'L3',
  L4:   'L4',
  JASA: 'Jasa'
});

const TAB = Object.freeze({
  SUPPLIERS: 'suppliers',
  PRODUCTS:  'products',
  JASA:      'jasa',
  COMPARE:   'compare'
});

const SCREEN = Object.freeze({
  MAIN:            'screen-main',
  SUPPLIER_DETAIL: 'screen-supplier-detail',
  PRODUCT_DETAIL:  'screen-product-detail',
  JASA_DETAIL:     'screen-jasa-detail'
});

const STORAGE_KEY = Object.freeze({
  SESSION:  'arkana_session',
  CACHE:    'arkana_cache',
  LOG:      'arkana_activity_log',
  AVATAR:   'arkana_avatar',
  PIN:      'arkana_pin'
});

const SUPPLIER_COLORS = Object.freeze([
  'linear-gradient(135deg,#1D4ED8,#3B82F6)',
  'linear-gradient(135deg,#065F46,#10B981)',
  'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  'linear-gradient(135deg,#B45309,#F59E0B)'
]);

const SATUAN_PRODUK = Object.freeze([
  'pcs','unit','box','rim','lusin','kg','liter','set','roll'
]);

const SATUAN_JASA = Object.freeze([
  'per project','per jam','per hari','per bulan','per m²','per unit','per pcs'
]);

// ─────────────────────────────────────────
// EXPENSE TRACKER
// ─────────────────────────────────────────

const EXPENSE_TYPE = Object.freeze({
  UMUM:   'umum',
  PROYEK: 'proyek'
});

const METODE_BAYAR = Object.freeze({
  KAS_PERUSAHAAN: 'kas_perusahaan',
  PERSONAL:       'personal',
  VENDOR_PAYLATER:'vendor_paylater'
});

const METODE_BAYAR_LABEL = Object.freeze({
  kas_perusahaan:  'Kas Perusahaan',
  personal:        'Personal',
  vendor_paylater: 'Vendor Paylater'
});

const REIMBURSE = Object.freeze({
  YA:    'ya',
  TIDAK: 'tidak'
});

const VENDOR_PAY_STATUS = Object.freeze({
  BELUM: 'belum',
  LUNAS: 'lunas'
});

const PROJECT_STATUS = Object.freeze({
  ACTIVE: 'active',
  CLOSED: 'closed'
});

// Expense tab identifiers
const EXPENSE_TAB = Object.freeze({
  PENGELUARAN: 'pengeluaran',
  RINGKASAN:   'ringkasan'
});

// Expense categories — grouped, hardcoded
// Last item in each group or use KATEGORI_LAINNYA sentinel for free text
const KATEGORI_EXPENSE = Object.freeze([
  {
    grup: 'Operasional Umum',
    items: [
      'Transport & BBM',
      'Makan & Konsumsi',
      'ATK & Perlengkapan Kantor',
      'Komunikasi & Internet',
      'Sewa & Utilitas'
    ]
  },
  {
    grup: 'Project',
    items: [
      'Material & Bahan',
      'Jasa & Subkon',
      'Perizinan & Administrasi',
      'Representasi & Entertain'
    ]
  },
  {
    grup: 'Lainnya',
    items: ['Lain-lain']
  }
]);

// Flat list of all kategori labels — useful for dropdowns
const KATEGORI_EXPENSE_FLAT = Object.freeze(
  KATEGORI_EXPENSE.flatMap(g => g.items)
);

// Sentinel — when user picks this, show free-text input
const KATEGORI_LAINNYA = 'Lain-lain';

// ─────────────────────────────────────────
// PROJECT MANAGER
// ─────────────────────────────────────────

const PROJECT_SCREEN = Object.freeze({
  MAIN:   'screen-main',
  DETAIL: 'screen-detail'
});
