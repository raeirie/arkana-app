// ═══════════════════════════════════════════════════
// Arkana App — Constants
// Single source of truth for all enums & keys.
// No magic strings anywhere else in the codebase.
// Load order: 2nd (after config.js)
// ═══════════════════════════════════════════════════

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
