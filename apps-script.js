// ═══════════════════════════════════════════════════════════
// ARKANA APP — Google Apps Script Backend
// Paste seluruh kode ini ke Google Apps Script, lalu Deploy
// ═══════════════════════════════════════════════════════════

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// Tab names
const TABS = {
  suppliers: 'Suppliers',
  products:  'Products',
  prices:    'PriceEntries',
  log:       'ActivityLog',
  settings:  'Settings',
  expenses:  'Expenses',
  projects:  'Projects'
};

// ─────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────
function doPost(e) {
  try {
    const action = e.parameter.action;
    const body = JSON.parse(e.postData.contents);

    let result;

    switch(action) {
      // ── Existing ──
      case 'getAll':          result = getAll(); break;
      case 'getLogs':         result = getLogs(); break;
      case 'validatePin':     result = validatePin(body); break;
      case 'addSupplier':     result = addSupplier(body); break;
      case 'updateSupplier':  result = updateSupplier(body); break;
      case 'deleteSupplier':  result = deleteSupplier(body.id); break;
      case 'addProduct':      result = addProduct(body); break;
      case 'updateProduct':   result = updateProduct(body); break;
      case 'deleteProduct':   result = deleteProduct(body.id); break;
      case 'addPrice':        result = addPrice(body); break;
      case 'deletePrice':     result = deletePrice(body.id); break;
      case 'addLog':          result = addLog(body); break;
      case 'updateSettings':  result = updateSettings(body); break;
      // ── Expenses ──
      case 'getExpenses':     result = getExpenses(); break;
      case 'addExpense':      result = addExpense(body); break;
      case 'updateExpense':   result = updateExpense(body); break;
      case 'deleteExpense':   result = deleteExpense(body.id); break;
      case 'markVendorLunas': result = markVendorLunas(body); break;
      // ── Projects ──
      case 'getProjects':     result = getProjects(); break;
      case 'addProject':      result = addProject(body); break;
      case 'updateProject':   result = updateProject(body); break;
      case 'deleteProject':   result = deleteProject(body.id); break;

      default: result = { ok: false, error: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─────────────────────────────────────────
// VALIDATE PIN (server-side)
// ─────────────────────────────────────────
function validatePin(body) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const settings = getSettings(ss);
  const pinField = body.user === 'arie' ? 'pinArie' : 'pinAjin';
  const stored = String(settings[pinField] || '1234').padStart(4, '0');
  const input  = String(body.pin || '').padStart(4, '0');
  return { ok: true, valid: stored === input };
}

// ─────────────────────────────────────────
// GET LOGS
// ─────────────────────────────────────────
function getLogs() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.log);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, logs: [] };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const logs = data.slice(1).reverse().slice(0, 100).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  return { ok: true, logs };
}

// ─────────────────────────────────────────
// GET ALL DATA (Supplier Tracker)
// ─────────────────────────────────────────
function getAll() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheets(ss);

  const suppliers    = sheetToObjects(ss.getSheetByName(TABS.suppliers));
  const products     = sheetToObjects(ss.getSheetByName(TABS.products));
  const priceEntries = sheetToObjects(ss.getSheetByName(TABS.prices));
  const settings     = getSettings(ss);

  suppliers.forEach(s => {
    try { s.units = JSON.parse(s.units || '[]'); } catch { s.units = []; }
    s.authorized = s.authorized === 'TRUE' || s.authorized === true;
    s.kontak = String(s.kontak || '');
  });

  priceEntries.forEach(e => {
    e.harga = parseFloat(e.harga) || 0;
    e.moq = e.moq ? parseInt(e.moq) : null;
  });

  products.forEach(p => {
    p.type = p.type || 'produk';
  });

  return {
    ok: true,
    db: { suppliers, products, priceEntries, units: settings.units, settings }
  };
}

// ─────────────────────────────────────────
// SUPPLIER OPERATIONS
// ─────────────────────────────────────────
function addSupplier(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.suppliers);
  const newRow = sheet.getLastRow() + 1;
  const rowData = [
    data.id, data.name, data.kontak || '', data.kota || '',
    data.level, JSON.stringify(data.units || []),
    data.authorized ? 'TRUE' : 'FALSE',
    data.catatan || '', data.createdBy, data.createdAt
  ];
  sheet.getRange(newRow, 1, 1, rowData.length).setValues([rowData]);
  sheet.getRange(newRow, 3).setNumberFormat('@');
  sheet.getRange(newRow, 3).setValue(data.kontak || '');
  return { ok: true };
}

function updateSupplier(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.suppliers);
  const rowIdx = findRow(sheet, data.id);
  if (rowIdx < 0) return { ok: false, error: 'Supplier tidak ditemukan: ' + data.id };

  const rowData = [
    data.id, data.name, data.kontak || '', data.kota || '',
    data.level, JSON.stringify(data.units || []),
    data.authorized ? 'TRUE' : 'FALSE',
    data.catatan || '', data.createdBy, data.createdAt
  ];
  sheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
  sheet.getRange(rowIdx, 3).setNumberFormat('@');
  sheet.getRange(rowIdx, 3).setValue(data.kontak || '');
  return { ok: true };
}

function deleteSupplier(id) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  deleteRow(ss.getSheetByName(TABS.suppliers), id);
  deleteRowsByField(ss.getSheetByName(TABS.prices), 'supplierId', id);
  return { ok: true };
}

// ─────────────────────────────────────────
// PRODUCT OPERATIONS
// ─────────────────────────────────────────
function addProduct(body) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const data = body.product;
  const sheet = ss.getSheetByName(TABS.products);

  sheet.appendRow([
    data.id, data.name, data.category || '',
    data.satuan || 'pcs', data.catatan || '',
    data.type || 'produk',
    data.createdBy, data.createdAt
  ]);

  if (body.price) addPrice(body.price);

  return { ok: true };
}

function updateProduct(body) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const data = body.product;
  const sheet = ss.getSheetByName(TABS.products);
  const rowIdx = findRow(sheet, data.id);
  if (rowIdx < 0) return { ok: false, error: 'Produk tidak ditemukan' };

  sheet.getRange(rowIdx, 1, 1, 8).setValues([[
    data.id, data.name, data.category || '',
    data.satuan || 'pcs', data.catatan || '',
    data.type || 'produk',
    data.createdBy, data.createdAt
  ]]);

  return { ok: true };
}

function deleteProduct(id) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  deleteRow(ss.getSheetByName(TABS.products), id);
  deleteRowsByField(ss.getSheetByName(TABS.prices), 'productId', id);
  return { ok: true };
}

// ─────────────────────────────────────────
// PRICE ENTRY OPERATIONS
// ─────────────────────────────────────────
function addPrice(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.prices);

  sheet.appendRow([
    data.id, data.productId || '', data.supplierId,
    data.harga, data.moq || '',
    data.catatan || '', data.updatedBy, data.updatedAt
  ]);

  return { ok: true };
}

function deletePrice(id) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  deleteRow(ss.getSheetByName(TABS.prices), id);
  return { ok: true };
}

// ─────────────────────────────────────────
// ACTIVITY LOG
// ─────────────────────────────────────────
function addLog(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.log);
  sheet.appendRow([
    new Date().toISOString(),
    data.action || '',
    data.detail || '',
    data.user || ''
  ]);
  return { ok: true };
}

// ─────────────────────────────────────────
// SETTINGS (Unit Bisnis + PIN)
// ─────────────────────────────────────────
function getSettings(ss) {
  const sheet = ss.getSheetByName(TABS.settings);
  if (!sheet || sheet.getLastRow() < 2) {
    return { units: defaultUnits(), pinArie: '', pinAjin: '' };
  }

  const data = sheet.getDataRange().getValues();
  const map = {};
  data.slice(1).forEach(row => { map[row[0]] = row[1]; });

  return {
    units: map['units'] ? JSON.parse(map['units']) : defaultUnits(),
    pinArie: map['pinArie'] || '',
    pinAjin: map['pinAjin'] || ''
  };
}

function updateSettings(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.settings);

  const keys = Object.keys(data).filter(k => k !== 'user');
  keys.forEach(key => {
    const vals = sheet.getDataRange().getValues();
    const value = (key === 'pinArie' || key === 'pinAjin')
      ? String(data[key]).padStart(4, '0')
      : data[key];

    let found = false;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === key) {
        const cell = sheet.getRange(i + 1, 2);
        cell.setNumberFormat('@');
        cell.setValue(value);
        found = true;
        break;
      }
    }
    if (!found) {
      const newRow = sheet.getLastRow() + 1;
      sheet.getRange(newRow, 2).setNumberFormat('@');
      sheet.appendRow([key, value]);
    }
  });

  return { ok: true };
}

function defaultUnits() {
  return ['IT & Elektronik','Alat Medis','ATK & Kantor','Logistik','Energi','Furnitur','Konstruksi','F&B','Umum'];
}

// ─────────────────────────────────────────
// EXPENSE OPERATIONS
// ─────────────────────────────────────────
function getExpenses() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheets(ss);
  const expenses = sheetToObjects(ss.getSheetByName(TABS.expenses));
  expenses.forEach(e => {
    e.jumlah = parseFloat(e.jumlah) || 0;
  });
  return { ok: true, expenses };
}

function addExpense(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.expenses);

  sheet.appendRow([
    data.id,
    data.tanggal       || '',
    data.deskripsi     || '',
    data.jumlah        || 0,
    data.kategori      || '',
    data.customKategori|| '',
    data.tipe          || 'umum',
    data.projectId     || '',
    data.metodePembayaran || '',
    data.perluReimburse|| '',
    data.dibayarOleh   || '',
    data.vendor        || '',
    data.vendorPayStatus || '',
    data.createdBy     || '',
    data.createdAt     || ''
  ]);

  return { ok: true };
}

function updateExpense(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.expenses);
  const rowIdx = findRow(sheet, data.id);
  if (rowIdx < 0) return { ok: false, error: 'Pengeluaran tidak ditemukan' };

  sheet.getRange(rowIdx, 1, 1, 15).setValues([[
    data.id,
    data.tanggal        || '',
    data.deskripsi      || '',
    data.jumlah         || 0,
    data.kategori       || '',
    data.customKategori || '',
    data.tipe           || 'umum',
    data.projectId      || '',
    data.metodePembayaran || '',
    data.perluReimburse || '',
    data.dibayarOleh    || '',
    data.vendor         || '',
    data.vendorPayStatus|| '',
    data.createdBy      || '',
    data.createdAt      || ''
  ]]);

  return { ok: true };
}

function deleteExpense(id) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  deleteRow(ss.getSheetByName(TABS.expenses), id);
  return { ok: true };
}

// Mark vendor paylater as lunas — only updates vendorPayStatus field (col 13)
function markVendorLunas(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.expenses);
  const rowIdx = findRow(sheet, data.id);
  if (rowIdx < 0) return { ok: false, error: 'Pengeluaran tidak ditemukan' };
  sheet.getRange(rowIdx, 13).setValue('lunas');
  return { ok: true };
}

// ─────────────────────────────────────────
// PROJECT OPERATIONS
// ─────────────────────────────────────────
function getProjects() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheets(ss);
  const projects = sheetToObjects(ss.getSheetByName(TABS.projects));
  return { ok: true, projects };
}

function addProject(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.projects);

  sheet.appendRow([
    data.id,
    data.nama       || '',
    data.unitBisnis || '',
    data.status     || 'active',
    data.createdBy  || '',
    data.createdAt  || ''
  ]);

  return { ok: true };
}

function updateProject(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(TABS.projects);
  const rowIdx = findRow(sheet, data.id);
  if (rowIdx < 0) return { ok: false, error: 'Proyek tidak ditemukan' };

  sheet.getRange(rowIdx, 1, 1, 6).setValues([[
    data.id,
    data.nama       || '',
    data.unitBisnis || '',
    data.status     || 'active',
    data.createdBy  || '',
    data.createdAt  || ''
  ]]);

  return { ok: true };
}

function deleteProject(id) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  // Warn: does not delete linked expenses — handled on frontend with confirm dialog
  deleteRow(ss.getSheetByName(TABS.projects), id);
  return { ok: true };
}

// ─────────────────────────────────────────
// SHEET HELPERS
// ─────────────────────────────────────────
function ensureSheets(ss) {
  const tabDefs = {
    [TABS.suppliers]: ['id','name','kontak','kota','level','units','authorized','catatan','createdBy','createdAt'],
    [TABS.products]:  ['id','name','category','satuan','catatan','type','createdBy','createdAt'],
    [TABS.prices]:    ['id','productId','supplierId','harga','moq','catatan','updatedBy','updatedAt'],
    [TABS.log]:       ['timestamp','action','detail','user'],
    [TABS.settings]:  ['key','value'],
    [TABS.expenses]:  ['id','tanggal','deskripsi','jumlah','kategori','customKategori','tipe','projectId','metodePembayaran','perluReimburse','dibayarOleh','vendor','vendorPayStatus','createdBy','createdAt'],
    [TABS.projects]:  ['id','nama','unitBisnis','status','createdBy','createdAt']
  };

  Object.entries(tabDefs).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);

      if (name === TABS.settings) {
        sheet.appendRow(['units', JSON.stringify(defaultUnits())]);
        sheet.appendRow(['pinArie', '1234']);
        sheet.appendRow(['pinAjin', '1234']);
      }
    }
  });
}

function sheetToObjects(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function findRow(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) return i + 1;
  }
  return -1;
}

function deleteRow(sheet, id) {
  const rowIdx = findRow(sheet, id);
  if (rowIdx > 0) sheet.deleteRow(rowIdx);
}

function deleteRowsByField(sheet, field, value) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = headers.indexOf(field);
  if (colIdx < 0) return;

  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][colIdx] == value) sheet.deleteRow(i + 1);
  }
}
