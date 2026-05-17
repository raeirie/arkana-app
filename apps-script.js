// ═══════════════════════════════════════════════════════════
// ARKANA APP — Google Apps Script Backend
// Paste seluruh kode ini ke Google Apps Script, lalu Deploy
// ═══════════════════════════════════════════════════════════

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// Tab names
const TABS = {
  suppliers: 'Suppliers',
  products: 'Products',
  prices: 'PriceEntries',
  log: 'ActivityLog',
  settings: 'Settings'
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
      case 'getAll':       result = getAll(); break;
      case 'getLogs':      result = getLogs(); break;
      case 'validatePin':  result = validatePin(body); break;
      case 'addSupplier':  result = addSupplier(body); break;
      case 'updateSupplier': result = updateSupplier(body); break;
      case 'deleteSupplier': result = deleteSupplier(body.id); break;
      case 'addProduct':   result = addProduct(body); break;
      case 'updateProduct': result = updateProduct(body); break;
      case 'deleteProduct': result = deleteProduct(body.id); break;
      case 'addPrice':     result = addPrice(body); break;
      case 'deletePrice':  result = deletePrice(body.id); break;
      case 'addLog':       result = addLog(body); break;
      case 'updateSettings': result = updateSettings(body); break;
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
  // Compare as strings, pad both to 4 digits for safety
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
// GET ALL DATA
// ─────────────────────────────────────────
function getAll() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureSheets(ss);

  const suppliers = sheetToObjects(ss.getSheetByName(TABS.suppliers));
  const products = sheetToObjects(ss.getSheetByName(TABS.products));
  const priceEntries = sheetToObjects(ss.getSheetByName(TABS.prices));
  const settings = getSettings(ss);

  // Parse units field (stored as JSON string)
  suppliers.forEach(s => {
    try { s.units = JSON.parse(s.units || '[]'); } catch { s.units = []; }
    s.authorized = s.authorized === 'TRUE' || s.authorized === true;
  });

  // Parse moq as number
  priceEntries.forEach(e => {
    e.harga = parseFloat(e.harga) || 0;
    e.moq = e.moq ? parseInt(e.moq) : null;
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

  sheet.appendRow([
    data.id, data.name, data.kontak || '', data.kota || '',
    data.level, JSON.stringify(data.units || []),
    data.authorized ? 'TRUE' : 'FALSE',
    data.catatan || '', data.createdBy, data.createdAt
  ]);

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
  return { ok: true };
}

function deleteSupplier(id) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  deleteRow(ss.getSheetByName(TABS.suppliers), id);
  // Also delete related price entries
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
    data.createdBy, data.createdAt
  ]);

  // Add initial price if provided
  if (body.price) {
    addPrice(body.price);
  }

  return { ok: true };
}

function updateProduct(body) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const data = body.product;
  const sheet = ss.getSheetByName(TABS.products);
  const rowIdx = findRow(sheet, data.id);
  if (rowIdx < 0) return { ok: false, error: 'Produk tidak ditemukan' };

  sheet.getRange(rowIdx, 1, 1, 7).setValues([[
    data.id, data.name, data.category || '',
    data.satuan || 'pcs', data.catatan || '',
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
    data.id, data.productId, data.supplierId,
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
    // PIN fields: always store as padded 4-digit string
    const value = (key === 'pinArie' || key === 'pinAjin')
      ? String(data[key]).padStart(4, '0')
      : data[key];

    let found = false;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === key) {
        const cell = sheet.getRange(i + 1, 2);
        // Force text format before setting value to prevent leading zero stripping
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
// SHEET HELPERS
// ─────────────────────────────────────────
function ensureSheets(ss) {
  const tabDefs = {
    [TABS.suppliers]:  ['id','name','kontak','kota','level','units','authorized','catatan','createdBy','createdAt'],
    [TABS.products]:   ['id','name','category','satuan','catatan','createdBy','createdAt'],
    [TABS.prices]:     ['id','productId','supplierId','harga','moq','catatan','updatedBy','updatedAt'],
    [TABS.log]:        ['timestamp','action','detail','user'],
    [TABS.settings]:   ['key','value']
  };

  Object.entries(tabDefs).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);

      // Add default data to settings
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
    if (data[i][0] == id) return i + 1; // 1-indexed
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

  // Delete from bottom to avoid index shift
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][colIdx] == value) sheet.deleteRow(i + 1);
  }
}
