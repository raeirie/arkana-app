# Arkana App — Changelog

---

## v1.1.3 — Bug Fix Batch 2
**Files:** `index.html`, `supplier-tracker.html`, `apps-script.js`

- fix: PIN validation now done server-side via Google Sheet (not localStorage)
- fix: Old PIN accepted after change on another device — now impossible since Sheet is source of truth
- fix: Phone number leading zero stripped — force text format on Suppliers sheet column C
- fix: PIN leading zero stripped (e.g. 0000 saved as 0) — padStart + cell text format fix
- fix: Version string v1.0.0 still showing on home screen — updated to v1.1.3
- fix: Login activity logged every time returning to home — now only logged on actual PIN entry
- fix: Accidental text selection on tap — user-select none applied globally
- feat: Phone number input now uses numpad keyboard (type=tel)
- feat: validatePin action added to Apps Script for server-side PIN checking

---

## v1.1.2 — Config & Architecture Fix
**Files:** `config.js`, `index.html`, `supplier-tracker.html`

- feat: config.js created as single source of truth for Apps Script URL
- fix: Script URL hardcoded per file removed — all files now reference config.js
- fix: Apps Script URL localStorage approach removed (required setup on every device)

---

## v1.1.1 — Bug Fix Batch 1
**Files:** `index.html`, `apps-script.js`

- fix: URLSearchParams not defined error in Apps Script (browser API used in server context)
- fix: API action parameter now read via e.parameter.action (correct Apps Script method)
- fix: Default PIN stored as SHA1 hash — changed to plain text 1234
- fix: Duplicate activity log entries — removed internal addLog calls from supplier/product operations
- fix: PIN sync blocking — login screen now waits for Sheet PIN before rendering
- fix: Activity log userId mapping incorrect — fixed name-to-id lookup from Sheet logs
- feat: getLogs action added to Apps Script
- feat: getAll now returns settings including PINs in response

---

## v1.1.0 — PRD-01 Supplier & Price Tracker
**Files:** `supplier-tracker.html`, `apps-script.js`, `index.html`

- feat: Supplier & Price Tracker module launched
- feat: CRUD suppliers — add, view detail, edit, delete
- feat: CRUD products with specs/notes field
- feat: Price entries per supplier per product with MOQ
- feat: Compare tab — all suppliers for one product, best price highlighted
- feat: L1–L4 level badges color-coded
- feat: Authorized/SPD flag on suppliers
- feat: Unit bisnis dynamic from Google Sheet Settings tab
- feat: Search and filter by level on suppliers tab
- feat: Activity log synced to Google Sheet ActivityLog tab
- feat: PIN sync via Google Sheet Settings tab
- feat: Google Apps Script backend with 5 sheet tabs
- feat: Offline read from localStorage cache
- fix: Supplier card on home page now links to supplier-tracker.html

---

## v1.0.0 — PRD-00 Login & Home Page
**Files:** `index.html`, `manifest.json`

- feat: Login screen with user selection (Arie / Ajin)
- feat: PIN-based authentication (4 digit)
- feat: Session persistence via localStorage
- feat: Home screen with feature hub (Coming Soon cards)
- feat: Aktivitas tab — activity log
- feat: Setting tab — change PIN, change avatar
- feat: Avatar upload from gallery (per device)
- feat: PWA manifest — installable on mobile
- feat: Dark navy theme, Plus Jakarta Sans typography
- feat: Bottom navigation (Home, Aktivitas, Setting)
