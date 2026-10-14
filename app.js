/**
 * app.js — หัวใจของแอป Moo Mee Tang เวอร์ชันติดตั้งบนมือถือ (PWA)
 *
 * แนวคิดหลัก "ออฟไลน์มาก่อน" (offline-first):
 *  1. ข้อมูลทุกอย่างถูกเก็บสำเนาไว้ในเครื่อง (IndexedDB) → เปิดแอปแล้วเห็นข้อมูลทันที ไม่ต้องรอเน็ต
 *  2. เวลาบันทึก/แก้ไข จะอัปเดตข้อมูลในเครื่องก่อนเสมอ แล้วค่อยส่งขึ้น Google Sheet
 *  3. ถ้าตอนนั้นไม่มีเน็ต คำสั่งจะถูกพักไว้ใน "คิว" (outbox) แล้วส่งให้อัตโนมัติเมื่อกลับมามีเน็ต
 *  4. หลังส่งคิวสำเร็จ จะดึงข้อมูลจริงจากชีตมาทับ เพื่อให้ตัวเลขตรงกับชีตเสมอ (ชีตคือความจริง)
 */

var APP_VERSION = '2026-10-14-pwa-3';

// ค่าทั่วไปจาก config.js (ไม่มีความลับ) + ลิงก์/โทเค็นที่โหลดจากเครื่องตอนเริ่มระบบ
var CONFIG = window.MOO_MEE_TANG_CONFIG || {};
CONFIG.API_URL = '';
CONFIG.API_TOKEN = '';

// ===================== การเชื่อมต่อ (เก็บในเครื่องนี้เท่านั้น ไม่อยู่บน GitHub) =====================

var CONNECTION_KEY = 'moo-mee-tang-connection';

function loadConnection() {
  try {
    var raw = localStorage.getItem(CONNECTION_KEY);
    if (!raw) return null;
    var c = JSON.parse(raw);
    return (c && c.url && c.token) ? c : null;
  } catch (e) {
    return null;
  }
}

function saveConnection(url, token) {
  localStorage.setItem(CONNECTION_KEY, JSON.stringify({ url: url, token: token, savedAt: Date.now() }));
}

function clearConnection() {
  try { localStorage.removeItem(CONNECTION_KEY); } catch (e) { /* ไม่เป็นไร */ }
}

/** ตรวจรูปแบบลิงก์ก่อนลองเชื่อมต่อ คืนข้อความผิดพลาด หรือ '' ถ้าผ่าน */
function validateApiUrl(url) {
  if (!url) return 'กรุณากรอกลิงก์เว็บแอป';
  if (url.indexOf('https://script.google.com/') !== 0) {
    return 'ลิงก์ต้องขึ้นต้นด้วย https://script.google.com/';
  }
  if (/\/dev(\?|$)/.test(url)) {
    return 'นี่คือลิงก์ทดสอบ (/dev) ใช้ไม่ได้ — ต้องใช้ลิงก์ที่ลงท้ายด้วย /exec จากหน้า Deploy';
  }
  if (!/\/exec(\?|$)/.test(url)) {
    return 'ลิงก์ต้องลงท้ายด้วย /exec';
  }
  return '';
}

var THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
var THAI_DAYS_SHORT = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];

// ===================== ธีมสี (เก็บเฉพาะในเครื่องนี้) =====================

var THEMES = [
  { id: 'teal',   name: 'ทะเลยามค่ำ', dark: true,  bar: '#0f3a4d', dots: ['#121317', '#16606e', '#f2c14e'] },
  { id: 'pink',   name: 'หมูชมพู',    dark: false, bar: '#e2557d', dots: ['#fff6f3', '#f2789a', '#2e9e5b'] },
  { id: 'mint',   name: 'ใบเตย',      dark: false, bar: '#2e8b57', dots: ['#f2f8f3', '#4caf65', '#e8a92c'] },
  { id: 'sky',    name: 'ท้องฟ้า',    dark: false, bar: '#2a62b8', dots: ['#f2f6fc', '#4a8de0', '#eaa82a'] },
  { id: 'violet', name: 'ม่วงราตรี',  dark: true,  bar: '#3b2466', dots: ['#14111c', '#5d3ca3', '#a98bf5'] },
  { id: 'black',  name: 'ดำสนิท',     dark: true,  bar: '#000000', dots: ['#000000', '#1f1f23', '#f2c14e'] }
];
var THEME_KEY = 'moo-mee-tang-theme';

function currentThemeId() {
  try { return localStorage.getItem(THEME_KEY) || 'teal'; } catch (e) { return 'teal'; }
}

function applyTheme(id) {
  var t = THEMES.filter(function (x) { return x.id === id; })[0] || THEMES[0];
  if (t.id === 'teal') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t.id);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bar);
  return t.id;
}
applyTheme(currentThemeId());

// ===================== คลังไอคอนหมวดหมู่ =====================
// ใช้อิโมจิ (บน iPhone แสดงเป็นภาพสีสวยแบบ Apple) — ทำงานออฟไลน์ได้ และเก็บในชีตเป็นตัวอักษรธรรมดา
// ไม่ใช้รูปแทรกในเซลล์ เพราะแบบนั้นแอปอ่านไม่ได้

var ICON_LIBRARY = [
  { name: 'อาหารและเครื่องดื่ม', icons: ['🍚','🍜','🍛','🍲','🍱','🍣','🥟','🍳','🍔','🍕','🥗','🍗','🥩','🍞','🍰','🍩','🍦','🍉','🍎','🧋','☕','🥤','🍺','🍻'] },
  { name: 'เดินทาง', icons: ['🚗','🚕','🛵','🏍️','🚌','🚆','🚇','✈️','🚲','⛽','🅿️','🔧','🛞','🛳️'] },
  { name: 'บ้านและบิล', icons: ['🏠','🏢','💡','💧','🔥','📶','📱','💻','📺','🧺','🧹','🛋️','🔑','🧾','🧻','🪴'] },
  { name: 'ช้อปปิ้ง', icons: ['🛍️','🛒','👕','👗','👟','👜','💄','💍','⌚','🎁','📦','🧸'] },
  { name: 'สุขภาพ', icons: ['💊','🏥','🩺','🦷','👓','💪','🏃','🧘','🩹','💉'] },
  { name: 'ครอบครัวและสังคม', icons: ['👶','🍼','🧒','👨‍👩‍👧','🐶','🐱','💝','🙏','🎂','💒','🤝','🧧'] },
  { name: 'บันเทิงและการศึกษา', icons: ['🎬','🎮','🎵','🎤','📚','🎓','✏️','🎨','⚽','🏸','🏖️','🏕️','🎟️','📸'] },
  { name: 'รายรับและการเงิน', icons: ['💵','💰','💳','🏦','💸','🪙','📈','📉','💹','💼','🧑‍⚕️','🔬','⏰','🏆','🏅','➕'] },
  { name: 'อื่นๆ', icons: ['⭐','❤️','🔶','🔷','📌','🗂️','❓','✨'] }
];

/** ไอคอนของหมวดหมู่ (ไว้แสดงในรายการ) — ถ้าหาไม่เจอใช้ไอคอนพื้นฐานตามประเภท */
function categoryIcon(type, name) {
  var list = state.categories[type] || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].name === name && list[i].icon) return list[i].icon;
  }
  return type === 'income' ? '💰' : '🧾';
}

var PALETTE = ['#4FA8E8', '#FF7E79', '#F5C451', '#8E7CE8', '#4FD1B0',
  '#F2934E', '#E85D9E', '#7ED957', '#B47EE8', '#5DC8CD'];

// ===================== สถานะกลางของแอป =====================

var state = {
  tab: 'home',
  year: new Date().getFullYear(),
  monthIndex: new Date().getMonth(),
  categories: { income: [], expense: [] },
  assetsOverview: { total: 0, groups: [] },
  months: {},              // { 'ปี-เดือน': ข้อมูลเดือนนั้น }
  outboxCount: 0,
  analysisType: 'expense',
  editingAssetName: null,
  syncing: false,
  lastSync: null,
  lastError: null
};

// ===================== ตัวช่วยทั่วไป =====================

function $(id) { return document.getElementById(id); }

function on(id, evt, handler) {
  var el = $(id);
  if (!el) { console.warn('ไม่พบ element #' + id); return null; }
  el.addEventListener(evt, handler);
  return el;
}

function escapeHtml(str) {
  var s;
  try { s = (str === null || str === undefined) ? '' : String(str); } catch (e) { s = ''; }
  return s.replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function formatBaht(amount) {
  amount = Number(amount) || 0;
  var neg = amount < 0;
  var abs = Math.abs(amount);
  var hasDecimals = Math.round(abs * 100) % 100 !== 0;
  var str = abs.toLocaleString('en-US', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  });
  return (neg ? '-' : '') + '฿' + str;
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function monthKey(year, monthIndex) { return year + '-' + monthIndex; }

function buildMonthSheetName(year, monthIndex) {
  return THAI_MONTHS_SHORT[monthIndex] + (year + 543);
}

function formatThaiDayLabel(dateObj) {
  return THAI_DAYS_SHORT[dateObj.getDay()] + ' ' + dateObj.getDate() + '/' + (dateObj.getMonth() + 1);
}

function parseDateStr(s) {
  var p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function showToast(msg) {
  var t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function () { t.classList.remove('show'); }, 3000);
}

function isOnline() { return navigator.onLine !== false; }

// ===================== ฐานข้อมูลในเครื่อง (IndexedDB) =====================

var DB_NAME = 'moo-mee-tang';
var DB_VERSION = 1;
var db = null;

function openDb() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function (e) {
      var d = e.target.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('months')) d.createObjectStore('months', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = function () { db = req.result; resolve(db); };
    req.onerror = function () { reject(req.error); };
  });
}

function idbRun(storeName, mode, fn) {
  return new Promise(function (resolve, reject) {
    if (!db) { reject(new Error('ฐานข้อมูลในเครื่องยังไม่พร้อม')); return; }
    var tx = db.transaction(storeName, mode);
    var store = tx.objectStore(storeName);
    var req = fn(store);
    tx.oncomplete = function () { resolve(req ? req.result : undefined); };
    tx.onerror = function () { reject(tx.error); };
    tx.onabort = function () { reject(tx.error); };
  });
}

function kvGet(key) {
  return idbRun('kv', 'readonly', function (s) { return s.get(key); })
    .then(function (row) { return row ? row.value : undefined; });
}
function kvSet(key, value) {
  return idbRun('kv', 'readwrite', function (s) { return s.put({ key: key, value: value }); });
}
function monthGet(key) {
  return idbRun('months', 'readonly', function (s) { return s.get(key); })
    .then(function (row) { return row ? row.value : undefined; });
}
function monthSet(key, value) {
  return idbRun('months', 'readwrite', function (s) { return s.put({ key: key, value: value }); });
}
function outboxAll() {
  return idbRun('outbox', 'readonly', function (s) { return s.getAll(); });
}
function outboxAdd(entry) {
  return idbRun('outbox', 'readwrite', function (s) { return s.add(entry); });
}
function outboxDelete(id) {
  return idbRun('outbox', 'readwrite', function (s) { return s.delete(id); });
}

// ===================== คุยกับ Google Apps Script =====================

function apiGet(action, params) {
  var url = CONFIG.API_URL + (CONFIG.API_URL.indexOf('?') === -1 ? '?' : '&') +
    'action=' + encodeURIComponent(action) +
    '&token=' + encodeURIComponent(CONFIG.API_TOKEN);
  if (params) {
    Object.keys(params).forEach(function (k) {
      url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    });
  }
  return fetch(url, { method: 'GET', redirect: 'follow' })
    .then(parseApiResponse);
}

/**
 * อ่านคำตอบจาก Apps Script
 * ถ้าได้หน้าเว็บ (HTML) กลับมาแทน JSON มักแปลว่า Deploy ไม่ได้ตั้งเป็น "ทุกคน (Anyone)"
 * Google จึงส่งหน้าล็อกอินมาแทน — แจ้งสาเหตุให้ชัดแทนข้อความ error งง ๆ
 */
function parseApiResponse(res) {
  return res.text().then(function (text) {
    var json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error('ได้หน้าเว็บกลับมาแทนข้อมูล — ตรวจว่า Deploy ตั้ง "ผู้ที่มีสิทธิ์เข้าถึง" เป็น "ทุกคน (Anyone)" และใช้ลิงก์ /exec');
    }
    if (!json.ok) throw new Error(json.error || 'เซิร์ฟเวอร์ตอบกลับผิดพลาด');
    return json.data;
  });
}

function apiPost(body) {
  body.token = CONFIG.API_TOKEN;
  return fetch(CONFIG.API_URL, {
    method: 'POST',
    // ตั้งใจใช้ text/plain เพื่อเลี่ยง preflight (OPTIONS) ที่ Apps Script ไม่รองรับ
    // ฝั่งเซิร์ฟเวอร์อ่าน body แล้ว JSON.parse เองอยู่แล้ว
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow'
  })
    .then(parseApiResponse);
}

// ===================== เครื่องมือซิงก์ =====================

/** ดึงข้อมูลทั้งหมดจากชีตมาทับสำเนาในเครื่อง */
function syncFromServer() {
  return apiGet('bootstrap', { monthsBack: CONFIG.MONTHS_TO_CACHE || 2 })
    .then(function (data) {
      state.categories = data.categories || { income: [], expense: [] };
      state.assetsOverview = data.assetsOverview || { total: 0, groups: [] };

      var writes = [
        kvSet('categories', state.categories),
        kvSet('assetsOverview', state.assetsOverview),
        kvSet('availableMonths', data.availableMonths || [])
      ];

      (data.months || []).forEach(function (m) {
        var key = monthKey(m.year, m.monthIndex);
        state.months[key] = m;
        writes.push(monthSet(key, m));
      });

      state.lastSync = new Date().toISOString();
      state.lastError = null;
      writes.push(kvSet('lastSync', state.lastSync));

      return Promise.all(writes);
    });
}

/** ดึงข้อมูลเดือนใดเดือนหนึ่งที่ยังไม่มีในเครื่อง (ตอนกดเลื่อนดูเดือนเก่า) */
function fetchMonth(year, monthIndex) {
  return apiGet('getMonthData', { year: year, monthIndex: monthIndex })
    .then(function (data) {
      var key = monthKey(year, monthIndex);
      state.months[key] = data;
      return monthSet(key, data).then(function () { return data; });
    });
}

/**
 * ส่งคำสั่งที่ค้างอยู่ในคิวขึ้นชีตทั้งหมด
 * - ส่งเป็นชุดเดียว (batch) เพื่อประหยัดเวลา
 * - คำสั่งที่เซิร์ฟเวอร์ปฏิเสธ (เช่นชื่อซ้ำ) จะถูกเอาออกจากคิวพร้อมแจ้งเตือน ไม่ปล่อยให้ค้างจนคิวตัน
 * - ถ้าเน็ตล่มระหว่างส่ง คิวจะคงอยู่ครบ แล้วลองใหม่รอบหน้า
 */
function flushOutbox() {
  return outboxAll().then(function (items) {
    if (!items.length) return { flushed: 0 };

    var batch = items.map(function (it) {
      return { id: it.id, action: it.action, args: it.args };
    });

    return apiPost({ batch: batch }).then(function (data) {
      var results = (data && data.results) || [];
      var failures = [];
      var chain = Promise.resolve();

      results.forEach(function (r) {
        chain = chain.then(function () { return outboxDelete(r.id); });
        if (!r.ok) {
          var src = items.filter(function (i) { return i.id === r.id; })[0];
          failures.push((src && src.label ? src.label : 'รายการหนึ่ง') + ': ' + r.error);
        }
      });

      return chain.then(function () {
        if (failures.length) {
          showToast('ซิงก์ไม่สำเร็จ ' + failures.length + ' รายการ — ' + failures[0]);
        }
        return { flushed: results.length, failures: failures };
      });
    });
  });
}

/** งานซิงก์เต็มรูปแบบ: ส่งคิวก่อน แล้วค่อยดึงข้อมูลจริงมาทับ */
function fullSync(options) {
  options = options || {};
  if (state.syncing) return Promise.resolve();
  if (!CONFIG.API_URL || !CONFIG.API_TOKEN) return Promise.resolve();

  state.syncing = true;
  renderSyncStatus();

  return flushOutbox()
    .then(function () { return syncFromServer(); })
    .then(function () { return refreshOutboxCount(); })
    .then(function () {
      state.syncing = false;
      renderSyncStatus();
      renderCurrentTab();
      if (options.notify) showToast('ซิงก์ข้อมูลเรียบร้อย');
    })
    .catch(function (err) {
      state.syncing = false;
      state.lastError = err.message || String(err);
      renderSyncStatus();
      if (options.notify) showToast('ซิงก์ไม่สำเร็จ: ' + state.lastError);
      console.warn('sync failed', err);
    });
}

function refreshOutboxCount() {
  return outboxAll().then(function (items) {
    state.outboxCount = items.length;
    return items.length;
  });
}

/**
 * ทำคำสั่งเขียนข้อมูล 1 อย่าง
 * @param action ชื่อคำสั่งฝั่งเซิร์ฟเวอร์
 * @param args   พารามิเตอร์ของคำสั่งนั้น
 * @param localMutation ฟังก์ชันที่อัปเดตข้อมูลในเครื่องทันที (ให้ UI ตอบสนองไว ไม่ต้องรอเน็ต)
 * @param label ข้อความสั้น ๆ ไว้อ้างอิงเวลาแจ้งเตือนว่าอะไรซิงก์ไม่ผ่าน
 */
function performWrite(action, args, localMutation, label) {
  if (localMutation) {
    try { localMutation(); } catch (e) { console.warn('local mutation failed', e); }
  }

  return persistLocalState()
    .then(function () { return outboxAdd({ action: action, args: args, label: label, createdAt: Date.now() }); })
    .then(function () { return refreshOutboxCount(); })
    .then(function () {
      renderSyncStatus();
      renderCurrentTab();
      if (isOnline()) {
        // ไม่ await ตรงนี้ เพื่อให้ UI ไม่ค้างรอเน็ต
        fullSync();
      }
    });
}

function persistLocalState() {
  var writes = [
    kvSet('categories', state.categories),
    kvSet('assetsOverview', state.assetsOverview)
  ];
  Object.keys(state.months).forEach(function (k) {
    writes.push(monthSet(k, state.months[k]));
  });
  return Promise.all(writes);
}

// ===================== อัปเดตข้อมูลในเครื่อง (ให้ตรงกับที่เซิร์ฟเวอร์จะทำ) =====================

function ensureMonthLocal(year, monthIndex) {
  var key = monthKey(year, monthIndex);
  if (!state.months[key]) {
    state.months[key] = {
      sheetName: buildMonthSheetName(year, monthIndex),
      year: year, monthIndex: monthIndex,
      totalIncome: 0, totalExpense: 0, balance: 0, days: []
    };
  }
  return state.months[key];
}

function findAssetLocal(name) {
  var groups = state.assetsOverview.groups || [];
  for (var i = 0; i < groups.length; i++) {
    var list = groups[i].assets || [];
    for (var j = 0; j < list.length; j++) {
      if (list[j].name === name) return { asset: list[j], group: groups[i] };
    }
  }
  return null;
}

function recomputeAssetTotals() {
  var total = 0;
  (state.assetsOverview.groups || []).forEach(function (g) {
    g.subtotal = (g.assets || []).reduce(function (s, a) { return s + (Number(a.balance) || 0); }, 0);
    if (g.includeInTotal) total += g.subtotal;
  });
  state.assetsOverview.total = total;
}

function applyAssetDeltaLocal(accountName, delta) {
  if (!accountName) return;
  var found = findAssetLocal(accountName);
  if (!found) return;
  found.asset.balance = (Number(found.asset.balance) || 0) + delta;
  recomputeAssetTotals();
}

function recomputeMonthTotals(month) {
  var income = 0, expense = 0;
  (month.days || []).forEach(function (day) {
    day.income = 0; day.expense = 0;
    (day.items || []).forEach(function (it) {
      var amt = Number(it.amount) || 0;
      if (it.type === 'income') { day.income += amt; income += amt; }
      else { day.expense += amt; expense += amt; }
    });
  });
  month.days = (month.days || []).filter(function (d) { return (d.items || []).length > 0; });
  month.days.sort(function (a, b) { return a.key < b.key ? 1 : (a.key > b.key ? -1 : 0); });
  month.totalIncome = income;
  month.totalExpense = expense;
  month.balance = income - expense;
}

function addTransactionLocal(tx) {
  var d = parseDateStr(tx.dateStr);
  var month = ensureMonthLocal(d.getFullYear(), d.getMonth());

  var day = (month.days || []).filter(function (x) { return x.key === tx.dateStr; })[0];
  if (!day) {
    day = { key: tx.dateStr, label: formatThaiDayLabel(d), income: 0, expense: 0, items: [] };
    month.days.push(day);
  }

  day.items.push({
    localId: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    pending: true,                 // ยังไม่ได้ขึ้นชีต — แสดงป้าย "รอซิงก์" ให้เห็นชัด
    type: tx.type,
    category: tx.category,
    account: tx.account,
    amount: Number(tx.amount) || 0,
    note: tx.note || ''
  });

  recomputeMonthTotals(month);
  applyAssetDeltaLocal(tx.account, tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount));
}

function deleteTransactionLocal(monthK, rowIndex) {
  var month = state.months[monthK];
  if (!month) return;
  var removed = null;
  (month.days || []).forEach(function (day) {
    day.items = (day.items || []).filter(function (it) {
      if (!removed && it.rowIndex === rowIndex) { removed = it; return false; }
      return true;
    });
  });
  if (!removed) return;
  recomputeMonthTotals(month);
  applyAssetDeltaLocal(removed.account, removed.type === 'income' ? -removed.amount : removed.amount);
}

function findGroupLocal(name) {
  return (state.assetsOverview.groups || []).filter(function (g) { return g.name === name; })[0];
}

// ===================== คำนวณหน้าวิเคราะห์เองในเครื่อง =====================

function computeAnalysis(month, type) {
  var result = { total: 0, categories: [] };
  if (!month) return result;

  var catMap = {};
  (month.days || []).forEach(function (day) {
    (day.items || []).forEach(function (it) {
      if (it.type !== type) return;
      var cat = it.category || 'ไม่ระบุหมวดหมู่';
      var amt = Number(it.amount) || 0;
      catMap[cat] = (catMap[cat] || 0) + amt;
      result.total += amt;
    });
  });

  var cats = Object.keys(catMap).map(function (n) { return { name: n, amount: catMap[n] }; });
  cats.sort(function (a, b) { return b.amount - a.amount; });
  cats.forEach(function (c, i) {
    c.percent = result.total > 0 ? Math.round((c.amount / result.total) * 1000) / 10 : 0;
    c.color = PALETTE[i % PALETTE.length];
  });
  result.categories = cats;
  return result;
}

function computeAnalysisCombined(month) {
  var inc = computeAnalysis(month, 'income');
  var exp = computeAnalysis(month, 'expense');
  var cats = [];
  inc.categories.forEach(function (c) { cats.push({ name: c.name, amount: c.amount, type: 'income' }); });
  exp.categories.forEach(function (c) { cats.push({ name: c.name, amount: c.amount, type: 'expense' }); });
  cats.sort(function (a, b) { return b.amount - a.amount; });
  return {
    totalIncome: inc.total,
    totalExpense: exp.total,
    net: inc.total - exp.total,
    categories: cats
  };
}

// ===================== วาดกราฟด้วย SVG (ไม่พึ่งไลบรารีภายนอก จึงทำงานออฟไลน์ได้) =====================

function renderDonutSvg(cats, total, centerLabel, valueColor) {
  var size = 250, stroke = 40;
  var r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
  var C = 2 * Math.PI * r;

  var ring = '';
  if (total > 0) {
    var offset = 0;
    cats.forEach(function (c) {
      var len = (c.amount / total) * C;
      ring += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" ' +
        'stroke="' + c.color + '" stroke-width="' + stroke + '" ' +
        'stroke-dasharray="' + len + ' ' + (C - len) + '" ' +
        'stroke-dashoffset="' + (-offset) + '" ' +
        'transform="rotate(-90 ' + cx + ' ' + cy + ')"></circle>';
      offset += len;
    });
  } else {
    ring = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke-width="' + stroke + '" style="stroke:var(--border)"></circle>';
  }

  return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img">' +
    ring +
    '<text class="donut-center-label" x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle">' + escapeHtml(centerLabel) + '</text>' +
    '<text class="donut-center-value" x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle" style="fill:' + valueColor + '">' +
    escapeHtml(formatBaht(total)) + '</text>' +
    '</svg>';
}

function renderBarsSvg(rows) {
  var width = 300, rowH = 58, pad = 8;
  var height = rows.length * rowH + pad;
  var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
  var barW = width - 20;

  var body = '';
  rows.forEach(function (r, i) {
    var y = i * rowH + pad;
    var w = Math.max(2, (r.value / max) * barW);
    body +=
      '<text class="bar-label" x="0" y="' + (y + 12) + '">' + escapeHtml(r.label) + '</text>' +
      '<text class="bar-value" x="' + width + '" y="' + (y + 12) + '" text-anchor="end">' + escapeHtml(formatBaht(r.value)) + '</text>' +
      '<rect x="0" y="' + (y + 20) + '" width="' + barW + '" height="16" rx="8" style="fill:var(--bg-card-alt)"></rect>' +
      '<rect x="0" y="' + (y + 20) + '" width="' + w + '" height="16" rx="8" style="fill:' + r.color + '"></rect>';
  });

  return '<svg viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" role="img">' +
    body + '</svg>';
}

// ===================== การแสดงผล =====================

function renderSyncStatus() {
  var el = $('syncStatus');
  if (!el) return;

  var dotClass = 'sync-dot';
  var text;

  if (state.syncing) {
    text = 'กำลังซิงก์ข้อมูล...';
  } else if (!isOnline()) {
    dotClass += ' offline';
    text = 'ออฟไลน์ — บันทึกลงเครื่องไว้ก่อนได้เลย';
    if (state.outboxCount) text += ' (รอซิงก์ ' + state.outboxCount + ' รายการ)';
  } else if (state.outboxCount) {
    dotClass += ' offline';
    text = 'รอซิงก์ ' + state.outboxCount + ' รายการ';
  } else if (state.lastError) {
    dotClass += ' error';
    text = 'ซิงก์ไม่สำเร็จ — แตะปุ่ม ⟳ เพื่อลองใหม่';
  } else if (state.lastSync) {
    var d = new Date(state.lastSync);
    text = 'ซิงก์ล่าสุด ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  } else {
    text = 'ยังไม่เคยซิงก์';
  }

  el.innerHTML = '<span class="' + dotClass + '"></span><span>' + escapeHtml(text) + '</span>';

  var btn = $('syncBtn');
  if (btn) btn.classList.toggle('spinning', state.syncing);

  var detail = $('syncDetail');
  if (detail) {
    var lines = [];
    lines.push('สถานะเครือข่าย: ' + (isOnline() ? 'ออนไลน์' : 'ออฟไลน์'));
    lines.push('รายการรอซิงก์: ' + state.outboxCount + ' รายการ');
    lines.push('ซิงก์ล่าสุด: ' + (state.lastSync ? new Date(state.lastSync).toLocaleString('th-TH') : 'ยังไม่เคย'));
    if (state.lastError) lines.push('ข้อผิดพลาดล่าสุด: ' + state.lastError);
    detail.innerHTML = lines.map(escapeHtml).join('<br>');
  }
}

function updateMonthLabel() {
  var el = $('monthLabel');
  if (el) el.textContent = THAI_MONTHS_FULL[state.monthIndex] + ' ' + (state.year + 543);
}

function currentMonth() {
  return state.months[monthKey(state.year, state.monthIndex)];
}

function renderCurrentTab() {
  updateMonthLabel();
  if (state.tab === 'home') renderHome();
  else if (state.tab === 'assets') renderAssets();
  else if (state.tab === 'analysis') renderAnalysis();
  else if (state.tab === 'more') renderMore();
}

function renderHome() {
  var month = currentMonth();
  var balance = month ? month.balance : 0;
  var balanceEl = $('homeBalance');
  balanceEl.textContent = formatBaht(balance);
  // ติดลบต้องเป็นสีแดง ไม่งั้นอ่านผ่าน ๆ แล้วเข้าใจผิดว่าเดือนนี้เหลือเงิน
  balanceEl.style.color = balance < 0 ? 'var(--red)' : 'var(--green)';
  $('homeExpense').textContent = formatBaht(month ? month.totalExpense : 0);
  $('homeIncome').textContent = formatBaht(month ? month.totalIncome : 0);

  var container = $('dayList');
  var empty = $('homeEmpty');
  container.innerHTML = '';

  var days = (month && month.days) ? month.days : [];
  if (!days.length) {
    empty.hidden = false;
    empty.textContent = month
      ? 'ยังไม่มีรายการในเดือนนี้ กดปุ่ม + เพื่อเริ่มบันทึก'
      : (isOnline() ? 'กำลังโหลดข้อมูลเดือนนี้...' : 'ยังไม่มีข้อมูลเดือนนี้ในเครื่อง ต่อเน็ตแล้วกด ⟳ เพื่อดึงข้อมูล');
    return;
  }
  empty.hidden = true;

  days.forEach(function (day) {
    var group = document.createElement('div');
    group.className = 'day-group';

    var header = document.createElement('div');
    header.className = 'day-header';
    header.innerHTML = '<span>' + escapeHtml(day.label) + '</span>' +
      '<span>ค่าใช้จ่าย: ' + escapeHtml(formatBaht(day.expense)) + '</span>';
    group.appendChild(header);

    var card = document.createElement('div');
    card.className = 'tx-card';

    day.items.slice().reverse().forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'tx-row' + (item.pending ? ' pending' : '');
      var sign = item.type === 'income' ? '' : '-';
      row.innerHTML =
        '<div class="tx-icon">' + escapeHtml(categoryIcon(item.type, item.category)) + '</div>' +
        '<div class="tx-info">' +
        '  <div class="tx-cat">' + escapeHtml(item.category) +
             (item.pending ? '<span class="pending-badge">รอซิงก์</span>' : '') + '</div>' +
        '  <div class="tx-account">' + escapeHtml(item.account) +
             (item.note ? ' · ' + escapeHtml(item.note) : '') + '</div>' +
        '</div>' +
        '<div class="tx-amount ' + item.type + '">' + sign + escapeHtml(formatBaht(item.amount)) + '</div>' +
        '<button class="tx-delete" aria-label="ลบรายการ">✕</button>';

      row.querySelector('.tx-delete').addEventListener('click', function () {
        if (item.pending) {
          showToast('รายการนี้ยังรอซิงก์อยู่ ลบได้หลังซิงก์ขึ้นชีตแล้ว');
          return;
        }
        confirmDeleteTx(item);
      });

      card.appendChild(row);
    });

    group.appendChild(card);
    container.appendChild(group);
  });
}

function confirmDeleteTx(item) {
  if (!confirm('ลบรายการนี้หรือไม่?')) return;
  var month = currentMonth();
  if (!month) return;
  var key = monthKey(state.year, state.monthIndex);

  performWrite(
    'deleteTransaction',
    [month.sheetName, item.rowIndex],
    function () { deleteTransactionLocal(key, item.rowIndex); },
    'ลบรายการ ' + item.category
  ).then(function () { showToast('ลบรายการแล้ว'); });
}

function renderAssets() {
  var data = state.assetsOverview || { total: 0, groups: [] };
  $('assetsTotal').textContent = formatBaht(data.total);

  $('assetsByGroup').innerHTML = (data.groups || []).map(function (g) {
    var note = g.includeInTotal ? '' : ' (ไม่รวมยอด)';
    return '<div class="asset-type-pill">' + escapeHtml(g.name + note) +
      ': <b>' + escapeHtml(formatBaht(g.subtotal)) + '</b></div>';
  }).join('');

  var list = $('assetList');
  list.innerHTML = '';

  (data.groups || []).forEach(function (g) {
    var block = document.createElement('div');
    block.className = 'asset-group-block';

    var header = document.createElement('div');
    header.className = 'asset-group-header';
    header.innerHTML = '<span>' + escapeHtml(g.name) +
      (g.includeInTotal ? '' : '<span class="excluded-tag">ไม่รวมยอด</span>') + '</span>' +
      '<span>' + escapeHtml(formatBaht(g.subtotal)) + '</span>';
    block.appendChild(header);

    (g.assets || []).forEach(function (a, idx) {
      var card = document.createElement('div');
      card.className = 'asset-card';
      card.innerHTML =
        '<div class="asset-order-btns">' +
        '  <button class="order-btn up"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
        '  <button class="order-btn down"' + (idx === g.assets.length - 1 ? ' disabled' : '') + '>▼</button>' +
        '</div>' +
        '<div class="asset-main">' +
        '  <div class="asset-name">' + escapeHtml(a.name) + '</div>' +
        '  <div class="asset-balance">' + escapeHtml(formatBaht(a.balance)) + '</div>' +
        '</div>';

      card.querySelector('.asset-main').addEventListener('click', function () { openEditBalanceModal(a, g); });
      card.querySelector('.order-btn.up').addEventListener('click', function () { moveAssetLocalAndQueue(a, g, -1); });
      card.querySelector('.order-btn.down').addEventListener('click', function () { moveAssetLocalAndQueue(a, g, 1); });

      block.appendChild(card);
    });

    list.appendChild(block);
  });
}

function moveAssetLocalAndQueue(asset, group, direction) {
  performWrite('moveAsset', [asset.name, direction], function () {
    var arr = group.assets;
    var i = arr.indexOf(asset);
    var j = i + direction;
    if (i < 0 || j < 0 || j >= arr.length) return;
    arr[i] = arr[j];
    arr[j] = asset;
    // สลับเลขลำดับให้ตรงกับที่เซิร์ฟเวอร์จะทำ
    var tmp = arr[i].order; arr[i].order = arr[j].order; arr[j].order = tmp;
  }, 'ย้ายลำดับ ' + asset.name);
}

function renderAnalysis() {
  var month = currentMonth();
  var host = $('chartHost');
  var listEl = $('analysisList');
  var emptyEl = $('analysisEmpty');
  var summaryAll = $('analysisSummaryAll');

  listEl.innerHTML = '';

  if (state.analysisType === 'all') {
    summaryAll.hidden = false;
    var comb = computeAnalysisCombined(month);

    $('allIncomeTotal').textContent = formatBaht(comb.totalIncome);
    $('allExpenseTotal').textContent = formatBaht(comb.totalExpense);
    var netEl = $('allNetTotal');
    netEl.textContent = formatBaht(comb.net);
    netEl.style.color = comb.net >= 0 ? 'var(--green)' : 'var(--red)';

    host.innerHTML = renderBarsSvg([
      { label: 'รายได้', value: comb.totalIncome, color: 'var(--green)' },
      { label: 'ค่าใช้จ่าย', value: comb.totalExpense, color: 'var(--red)' }
    ]);

    if (!comb.categories.length) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;

    comb.categories.forEach(function (c) {
      var color = c.type === 'income' ? 'var(--green)' : 'var(--red)';
      var sign = c.type === 'income' ? '+' : '-';
      var row = document.createElement('div');
      row.className = 'analysis-row';
      row.innerHTML =
        '<span class="color-dot" style="background:' + color + '"></span>' +
        '<span class="analysis-name">' + escapeHtml(c.name) + '</span>' +
        '<span class="analysis-amount" style="color:' + color + '">' +
        sign + escapeHtml(formatBaht(c.amount)) + '</span>';
      listEl.appendChild(row);
    });
    return;
  }

  summaryAll.hidden = true;
  var data = computeAnalysis(month, state.analysisType);
  var valueColor = state.analysisType === 'income' ? 'var(--green)' : 'var(--red)';
  host.innerHTML = renderDonutSvg(data.categories, data.total, 'รวม', valueColor);

  if (!data.categories.length) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  data.categories.forEach(function (c) {
    var row = document.createElement('div');
    row.className = 'analysis-row';
    row.innerHTML =
      '<span class="color-dot" style="background:' + c.color + '"></span>' +
      '<span class="analysis-name">' + escapeHtml(c.name) + '</span>' +
      '<span class="analysis-percent">' + escapeHtml(String(c.percent)) + '%</span>' +
      '<span class="analysis-amount">' + escapeHtml(formatBaht(c.amount)) + '</span>';
    listEl.appendChild(row);
  });
}

function renderMore() {
  renderCategoryTiles('incomeCatList', 'income');
  renderCategoryTiles('expenseCatList', 'expense');
  renderThemes();
  $('appVersion').textContent = APP_VERSION;
  renderSyncStatus();
}

function renderCategoryTiles(elId, type) {
  var el = $(elId);
  var list = state.categories[type] || [];
  el.innerHTML = list.map(function (c, i) {
    return '<button class="cat-tile" data-i="' + i + '">' +
      '<span class="cat-icon">' + escapeHtml(c.icon || categoryIcon(type, '')) + '</span>' +
      '<span class="cat-name">' + escapeHtml(c.name) + '</span></button>';
  }).join('') +
    '<button class="cat-tile add" data-add="1"><span class="cat-icon">＋</span><span class="cat-name">เพิ่ม</span></button>';

  el.querySelectorAll('.cat-tile').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.dataset.add) openCategoryModal(type, null);
      else openCategoryModal(type, list[Number(btn.dataset.i)]);
    });
  });
}

function renderThemes() {
  var el = $('themeList');
  if (!el) return;
  var cur = currentThemeId();
  el.innerHTML = THEMES.map(function (t) {
    return '<button class="theme-opt' + (t.id === cur ? ' selected' : '') + '" data-id="' + t.id + '">' +
      '<div class="theme-swatch" style="background:' + t.dots[0] + '">' +
      t.dots.slice(1).map(function (d) { return '<i style="background:' + d + '"></i>'; }).join('') +
      '</div><div class="theme-name"><span>' + escapeHtml(t.name) + '</span><span>' + (t.id === cur ? '✓' : '') + '</span></div></button>';
  }).join('');
  el.querySelectorAll('.theme-opt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      try { localStorage.setItem(THEME_KEY, btn.dataset.id); } catch (e) { /* ไม่เป็นไร */ }
      applyTheme(btn.dataset.id);
      renderCurrentTab();
    });
  });
}

// ----- หน้าต่างเพิ่ม/แก้ไขหมวดหมู่ -----

var categoryEdit = { type: 'expense', original: null, icon: '' };

function openCategoryModal(type, cat) {
  categoryEdit.type = type;
  categoryEdit.original = cat ? cat.name : null;
  categoryEdit.icon = (cat && cat.icon) || (type === 'income' ? '💵' : '🧾');

  var label = type === 'income' ? 'รายรับ' : 'รายจ่าย';
  $('categoryModalTitle').textContent = cat ? 'แก้ไขหมวด' + label : 'เพิ่มหมวด' + label;
  $('categoryNameInput').value = cat ? cat.name : '';
  $('deleteCategoryBtn').hidden = !cat;
  $('categoryRenameNote').hidden = true;
  renderIconPicker();
  openModal('categoryModal');
}

function renderIconPicker() {
  $('categoryIconPreview').textContent = categoryEdit.icon;
  var host = $('iconPicker');
  host.innerHTML = ICON_LIBRARY.map(function (g) {
    return '<div class="icon-group-title">' + escapeHtml(g.name) + '</div><div class="icon-grid">' +
      g.icons.map(function (ic) {
        return '<button class="icon-opt' + (ic === categoryEdit.icon ? ' selected' : '') + '" data-ic="' +
          escapeHtml(ic) + '" aria-label="' + escapeHtml(ic) + '">' + escapeHtml(ic) + '</button>';
      }).join('') + '</div>';
  }).join('');
  host.querySelectorAll('.icon-opt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      categoryEdit.icon = btn.dataset.ic;
      $('categoryIconPreview').textContent = categoryEdit.icon;
      host.querySelectorAll('.icon-opt.selected').forEach(function (x) { x.classList.remove('selected'); });
      btn.classList.add('selected');
    });
  });
}

/** เปลี่ยนชื่อหมวดในข้อมูลที่เก็บในเครื่อง (ให้ตรงกับที่เซิร์ฟเวอร์ทำกับรายการเก่าทุกเดือน) */
function renameCategoryLocal(type, oldName, newName) {
  Object.keys(state.months).forEach(function (k) {
    (state.months[k].days || []).forEach(function (d) {
      (d.items || []).forEach(function (it) {
        if (it.type === type && it.category === oldName) it.category = newName;
      });
    });
  });
}

function saveCategory() {
  var type = categoryEdit.type;
  var name = $('categoryNameInput').value.trim();
  var icon = categoryEdit.icon;
  var old = categoryEdit.original;
  if (!name) { showToast('กรุณาใส่ชื่อหมวดหมู่'); return; }

  var list = state.categories[type] || (state.categories[type] = []);
  var clash = list.some(function (c) { return c.name === name && c.name !== old; });
  if (clash) { showToast('มีหมวดหมู่ชื่อนี้อยู่แล้ว'); return; }

  if (!old) {
    performWrite('addCategory', [type, name, icon], function () {
      list.push({ name: name, icon: icon });
    }, 'เพิ่มหมวดหมู่ ' + name).then(function () {
      closeModal('categoryModal');
      showToast('เพิ่มหมวดหมู่แล้ว');
    });
    return;
  }

  performWrite('updateCategory', [type, old, name, icon], function () {
    list.forEach(function (c) { if (c.name === old) { c.name = name; c.icon = icon; } });
    if (name !== old) renameCategoryLocal(type, old, name);
  }, 'แก้ไขหมวดหมู่ ' + old).then(function () {
    closeModal('categoryModal');
    showToast(name !== old ? 'แก้ไขแล้ว — เปลี่ยนชื่อในรายการเก่าให้ด้วย' : 'แก้ไขหมวดหมู่แล้ว');
  });
}

function deleteCategoryFromModal() {
  var type = categoryEdit.type, name = categoryEdit.original;
  if (!name) return;
  if (!confirm('ลบหมวดหมู่ "' + name + '" หรือไม่?\n(รายการเก่าที่เคยบันทึกไว้ยังอยู่ครบ)')) return;
  performWrite('deleteCategory', [type, name], function () {
    state.categories[type] = (state.categories[type] || []).filter(function (c) { return c.name !== name; });
  }, 'ลบหมวดหมู่ ' + name).then(function () {
    closeModal('categoryModal');
    showToast('ลบหมวดหมู่แล้ว');
  });
}

// ===================== ฟอร์มเพิ่มรายการ =====================

function populateCategorySelect() {
  var type = getCurrentTxType();
  var list = state.categories[type] || [];
  var sel = $('txCategory');
  if (!sel) return;
  sel.innerHTML = list.length
    ? list.map(function (c) {
        return '<option value="' + escapeHtml(c.name) + '">' +
          escapeHtml(c.icon || '') + ' ' + escapeHtml(c.name) + '</option>';
      }).join('')
    : '<option value="">— เพิ่มหมวดหมู่ในแท็บเพิ่มเติมก่อน —</option>';
  sel.selectedIndex = 0;
}

function allAssetsFlat() {
  var out = [];
  (state.assetsOverview.groups || []).forEach(function (g) {
    (g.assets || []).forEach(function (a) { out.push(a); });
  });
  return out;
}

function populateAccountSelect() {
  var sel = $('txAccount');
  if (!sel) return;
  var assets = allAssetsFlat();
  sel.innerHTML = assets.length
    ? assets.map(function (a) {
        return '<option value="' + escapeHtml(a.name) + '">' + escapeHtml(a.name) + '</option>';
      }).join('')
    : '<option value="">— เพิ่มสินทรัพย์ในแท็บกระเป๋าเงินก่อน —</option>';
  sel.selectedIndex = 0;
}

function getCurrentTxType() {
  var active = document.querySelector('#txTypeSegment .seg-btn.active');
  return active ? active.dataset.type : 'expense';
}

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

function openTxModal() {
  $('txAmount').value = '';
  $('txNote').value = '';
  $('receiptStatus').textContent = '';
  $('txDate').value = todayStr();
  populateCategorySelect();
  populateAccountSelect();
  openModal('txModal');
}

function saveTransaction() {
  var amount = parseFloat($('txAmount').value);
  if (!amount || amount <= 0) { showToast('กรุณาระบุจำนวนเงิน'); return; }
  var category = $('txCategory').value;
  if (!category) { showToast('กรุณาเลือกหมวดหมู่'); return; }

  var tx = {
    dateStr: $('txDate').value || todayStr(),
    type: getCurrentTxType(),
    category: category,
    account: $('txAccount').value,
    amount: amount,
    note: $('txNote').value
  };

  // เด้งไปเดือนของรายการที่เพิ่ง [บันทึก] เพื่อให้เห็นผลทันทีถ้าบันทึกย้อนเดือน
  var d = parseDateStr(tx.dateStr);
  state.year = d.getFullYear();
  state.monthIndex = d.getMonth();

  performWrite('addTransaction', [tx], function () { addTransactionLocal(tx); },
    'บันทึก ' + tx.category
  ).then(function () {
    closeModal('txModal');
    showToast(isOnline() ? 'บันทึกรายการแล้ว' : 'บันทึกลงเครื่องแล้ว จะซิงก์ให้เมื่อมีเน็ต');
  });
}

function handleReceiptUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  var statusEl = $('receiptStatus');

  if (!isOnline()) {
    statusEl.textContent = 'อ่านใบเสร็จอัตโนมัติต้องใช้เน็ต — ตอนนี้ออฟไลน์อยู่ กรอกจำนวนเงินเองได้เลย';
    return;
  }

  statusEl.textContent = 'กำลังอ่านใบเสร็จ...';
  var reader = new FileReader();
  reader.onload = function () {
    var base64 = String(reader.result).split(',')[1];
    apiPost({ action: 'ocrReceipt', args: [base64, file.type] })
      .then(function (result) {
        if (result && result.success) {
          if (result.guessAmount) $('txAmount').value = result.guessAmount;
          statusEl.textContent = 'อ่านได้ (โปรดตรวจสอบก่อนบันทึก):\n' + String(result.text || '').slice(0, 200);
        } else {
          statusEl.textContent = (result && result.message) || 'อ่านใบเสร็จไม่สำเร็จ';
        }
      })
      .catch(function (err) { statusEl.textContent = 'เกิดข้อผิดพลาด: ' + err.message; });
  };
  reader.readAsDataURL(file);
}

// ===================== สินทรัพย์และกลุ่ม =====================

function populateGroupSelects(selectedGroup) {
  var groups = state.assetsOverview.groups || [];
  var opts = groups.map(function (g) {
    return '<option value="' + escapeHtml(g.name) + '">' + escapeHtml(g.name) + '</option>';
  }).join('');

  var addSel = $('assetGroupSelect');
  if (addSel) {
    addSel.innerHTML = opts + '<option value="__new__">+ สร้างกลุ่มใหม่...</option>';
    addSel.selectedIndex = 0;
  }
  var moveSel = $('editAssetGroupSelect');
  if (moveSel) {
    moveSel.innerHTML = opts;
    if (selectedGroup) moveSel.value = selectedGroup;
  }
}

function saveAsset() {
  var name = $('assetName').value.trim();
  var groupSel = $('assetGroupSelect').value;
  var group = (groupSel === '__new__') ? $('assetNewGroupName').value.trim() : groupSel;
  var initial = parseFloat($('assetInitialBalance').value) || 0;

  if (!name) { showToast('กรุณาระบุชื่อสินทรัพย์'); return; }
  if (!group) { showToast('กรุณาระบุกลุ่ม'); return; }
  if (findAssetLocal(name)) { showToast('มีสินทรัพย์ชื่อนี้อยู่แล้ว'); return; }

  var args = [name, group];
  performWrite('addAsset', args, function () {
    var g = findGroupLocal(group);
    if (!g) {
      g = { name: group, includeInTotal: true, subtotal: 0, assets: [] };
      state.assetsOverview.groups.push(g);
    }
    var maxOrder = (g.assets || []).reduce(function (m, a) { return Math.max(m, a.order || 0); }, 0);
    g.assets.push({ name: name, group: group, balance: 0, order: maxOrder + 1 });
    recomputeAssetTotals();
  }, 'เพิ่มสินทรัพย์ ' + name)
    .then(function () {
      if (initial !== 0) {
        return performWrite('setAssetBalance', [name, initial], function () {
          var found = findAssetLocal(name);
          if (found) { found.asset.balance = initial; recomputeAssetTotals(); }
        }, 'ตั้งยอด ' + name);
      }
    })
    .then(function () {
      $('assetName').value = '';
      $('assetNewGroupName').value = '';
      $('assetInitialBalance').value = '0';
      closeModal('assetModal');
      showToast('เพิ่มสินทรัพย์แล้ว');
    });
}

function openEditBalanceModal(asset, group) {
  state.editingAssetName = asset.name;
  $('editBalanceTitle').textContent = 'จัดการ: ' + asset.name;
  $('editBalanceValue').value = asset.balance;
  populateGroupSelects(group ? group.name : asset.group);
  openModal('editBalanceModal');
}

function saveEditBalance() {
  var val = parseFloat($('editBalanceValue').value);
  if (isNaN(val)) { showToast('กรุณาระบุตัวเลข'); return; }
  var name = state.editingAssetName;

  performWrite('setAssetBalance', [name, val], function () {
    var found = findAssetLocal(name);
    if (found) { found.asset.balance = val; recomputeAssetTotals(); }
  }, 'ปรับยอด ' + name).then(function () {
    closeModal('editBalanceModal');
    showToast('ปรับยอดแล้ว');
  });
}

function moveAssetGroupHandler() {
  var newGroup = $('editAssetGroupSelect').value;
  var name = state.editingAssetName;

  performWrite('moveAssetToGroup', [name, newGroup], function () {
    var found = findAssetLocal(name);
    if (!found) return;
    found.group.assets = found.group.assets.filter(function (a) { return a.name !== name; });
    var dest = findGroupLocal(newGroup);
    if (!dest) {
      dest = { name: newGroup, includeInTotal: true, subtotal: 0, assets: [] };
      state.assetsOverview.groups.push(dest);
    }
    var maxOrder = (dest.assets || []).reduce(function (m, a) { return Math.max(m, a.order || 0); }, 0);
    found.asset.group = newGroup;
    found.asset.order = maxOrder + 1;
    dest.assets.push(found.asset);
    recomputeAssetTotals();
  }, 'ย้ายกลุ่ม ' + name).then(function () {
    closeModal('editBalanceModal');
    showToast('ย้ายกลุ่มแล้ว');
  });
}

function deleteAssetHandler() {
  if (!confirm('ลบสินทรัพย์นี้หรือไม่? (ประวัติรายการเดิมในชีตรายเดือนจะยังอยู่)')) return;
  var name = state.editingAssetName;

  performWrite('deleteAsset', [name], function () {
    var found = findAssetLocal(name);
    if (!found) return;
    found.group.assets = found.group.assets.filter(function (a) { return a.name !== name; });
    recomputeAssetTotals();
  }, 'ลบสินทรัพย์ ' + name).then(function () {
    closeModal('editBalanceModal');
    showToast('ลบสินทรัพย์แล้ว');
  });
}

function renderGroupsManageUI() {
  var groups = state.assetsOverview.groups || [];
  var el = $('groupsManageList');

  el.innerHTML = groups.map(function (g, idx) {
    return '<div class="group-row" data-name="' + escapeHtml(g.name) + '">' +
      '<div class="group-order-btns">' +
      '  <button class="order-btn up"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
      '  <button class="order-btn down"' + (idx === groups.length - 1 ? ' disabled' : '') + '>▼</button>' +
      '</div>' +
      '<div class="group-name">' + escapeHtml(g.name) + '</div>' +
      '<label class="switch"><input type="checkbox" class="include-toggle"' +
        (g.includeInTotal ? ' checked' : '') + '><span class="switch-slider"></span></label>' +
      '<button class="group-delete" aria-label="ลบกลุ่ม">🗑</button>' +
      '</div>';
  }).join('');

  el.querySelectorAll('.group-row').forEach(function (row) {
    var name = row.dataset.name;

    row.querySelector('.order-btn.up').addEventListener('click', function () { moveGroupAndQueue(name, -1); });
    row.querySelector('.order-btn.down').addEventListener('click', function () { moveGroupAndQueue(name, 1); });

    row.querySelector('.include-toggle').addEventListener('change', function (e) {
      var checked = e.target.checked;
      performWrite('setAssetGroupIncludeInTotal', [name, checked], function () {
        var g = findGroupLocal(name);
        if (g) { g.includeInTotal = checked; recomputeAssetTotals(); }
      }, 'ตั้งค่ารวมยอดกลุ่ม ' + name).then(renderGroupsManageUI);
    });

    row.querySelector('.group-delete').addEventListener('click', function () {
      var g = findGroupLocal(name);
      if (g && (g.assets || []).length) {
        showToast('ยังมีสินทรัพย์อยู่ในกลุ่มนี้ กรุณาย้ายออกก่อนลบกลุ่ม');
        return;
      }
      if (!confirm('ลบกลุ่ม "' + name + '" หรือไม่?')) return;
      performWrite('deleteAssetGroup', [name], function () {
        state.assetsOverview.groups = state.assetsOverview.groups.filter(function (x) { return x.name !== name; });
        recomputeAssetTotals();
      }, 'ลบกลุ่ม ' + name).then(function () {
        showToast('ลบกลุ่มแล้ว');
        renderGroupsManageUI();
      });
    });
  });
}

function moveGroupAndQueue(name, direction) {
  performWrite('moveAssetGroup', [name, direction], function () {
    var arr = state.assetsOverview.groups;
    var i = arr.findIndex(function (g) { return g.name === name; });
    var j = i + direction;
    if (i < 0 || j < 0 || j >= arr.length) return;
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }, 'ย้ายลำดับกลุ่ม ' + name).then(renderGroupsManageUI);
}

// ===================== แท็บและเดือน =====================

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
  $('tab-' + tab).classList.add('active');
  $('monthNav').style.display = (tab === 'home' || tab === 'analysis') ? 'flex' : 'none';
  renderCurrentTab();
}

function shiftMonth(delta) {
  state.monthIndex += delta;
  if (state.monthIndex < 0) { state.monthIndex = 11; state.year--; }
  if (state.monthIndex > 11) { state.monthIndex = 0; state.year++; }
  renderCurrentTab();

  // เดือนที่ยังไม่มีในเครื่อง — ถ้าออนไลน์ก็ดึงมาให้เลย แล้วเก็บไว้ดูออฟไลน์ได้ในอนาคต
  var key = monthKey(state.year, state.monthIndex);
  if (!state.months[key] && isOnline()) {
    fetchMonth(state.year, state.monthIndex)
      .then(function () { renderCurrentTab(); })
      .catch(function (err) { console.warn('fetch month failed', err); });
  }
}

// ===================== ผูกปุ่มทั้งหมด =====================

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });

  on('prevMonthBtn', 'click', function () { shiftMonth(-1); });
  on('nextMonthBtn', 'click', function () { shiftMonth(1); });
  on('syncBtn', 'click', function () { fullSync({ notify: true }); });
  on('forceSyncBtn', 'click', function () { fullSync({ notify: true }); });
  on('resetConnectionBtn', 'click', resetConnection);

  on('fabAdd', 'click', openTxModal);
  on('closeModalBtn', 'click', function () { closeModal('txModal'); });
  on('saveTxBtn', 'click', saveTransaction);
  on('receiptInput', 'change', handleReceiptUpload);

  on('txTypeSegment', 'click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    document.querySelectorAll('#txTypeSegment .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b === btn);
    });
    populateCategorySelect();
  });

  on('analysisSegment', 'click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.analysisType = btn.dataset.type;
    document.querySelectorAll('#analysisSegment .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b === btn);
    });
    renderAnalysis();
  });

  on('addAssetBtn', 'click', function () {
    populateGroupSelects();
    $('newGroupNameRow').hidden = true;
    openModal('assetModal');
  });
  on('closeAssetModalBtn', 'click', function () { closeModal('assetModal'); });
  on('saveAssetBtn', 'click', saveAsset);
  on('assetGroupSelect', 'change', function (e) {
    $('newGroupNameRow').hidden = (e.target.value !== '__new__');
  });

  on('closeEditBalanceBtn', 'click', function () { closeModal('editBalanceModal'); });
  on('saveEditBalanceBtn', 'click', saveEditBalance);
  on('moveGroupBtn', 'click', moveAssetGroupHandler);
  on('deleteAssetBtn', 'click', deleteAssetHandler);

  on('manageGroupsBtn', 'click', function () {
    renderGroupsManageUI();
    openModal('groupsModal');
  });
  on('closeGroupsModalBtn', 'click', function () { closeModal('groupsModal'); });
  on('addGroupBtn', 'click', function () {
    var input = $('newGroupName');
    var name = input.value.trim();
    if (!name) return;
    if (findGroupLocal(name)) { showToast('มีกลุ่มนี้อยู่แล้ว'); return; }
    performWrite('addAssetGroup', [name, true], function () {
      state.assetsOverview.groups.push({ name: name, includeInTotal: true, subtotal: 0, assets: [] });
    }, 'เพิ่มกลุ่ม ' + name).then(function () {
      input.value = '';
      showToast('เพิ่มกลุ่มแล้ว');
      renderGroupsManageUI();
    });
  });

  on('closeCategoryModalBtn', 'click', function () { closeModal('categoryModal'); });
  on('saveCategoryBtn', 'click', saveCategory);
  on('deleteCategoryBtn', 'click', deleteCategoryFromModal);
  on('categoryNameInput', 'input', function () {
    var changed = categoryEdit.original && $('categoryNameInput').value.trim() !== categoryEdit.original;
    $('categoryRenameNote').hidden = !changed;
  });

  document.querySelectorAll('.modal-overlay').forEach(function (ov) {
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.classList.remove('open'); });
  });

  // กลับมามีเน็ตเมื่อไร ส่งคิวที่ค้างให้ทันที
  window.addEventListener('online', function () {
    renderSyncStatus();
    showToast('กลับมาออนไลน์แล้ว กำลังซิงก์...');
    fullSync();
  });
  window.addEventListener('offline', renderSyncStatus);

  // กลับมาเปิดแอปอีกครั้ง (สลับจากแอปอื่น) ก็ซิงก์ให้สดเสมอ
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && isOnline()) fullSync();
  });
}

// ===================== เริ่มระบบ =====================

function loadFromLocal() {
  return Promise.all([
    kvGet('categories'),
    kvGet('assetsOverview'),
    kvGet('lastSync'),
    idbRun('months', 'readonly', function (s) { return s.getAll(); }),
    refreshOutboxCount()
  ]).then(function (res) {
    if (res[0]) state.categories = res[0];
    if (res[1]) state.assetsOverview = res[1];
    if (res[2]) state.lastSync = res[2];
    (res[3] || []).forEach(function (row) { state.months[row.key] = row.value; });
  });
}

// ===================== หน้าเชื่อมต่อครั้งแรก =====================

function showSetupScreen() {
  $('setupScreen').hidden = false;
  $('app').hidden = true;

  var msg = $('setupMessage');
  var btn = $('setupSaveBtn');

  btn.addEventListener('click', function () {
    var url = $('setupUrl').value.trim();
    var token = $('setupToken').value.replace(/\s+/g, '');

    msg.className = 'setup-message';
    var urlError = validateApiUrl(url);
    if (urlError) { msg.textContent = urlError; msg.classList.add('error'); return; }
    if (!token) { msg.textContent = 'กรุณาวางโทเค็นลับ'; msg.classList.add('error'); return; }
    if (!isOnline()) {
      msg.textContent = 'ต้องต่อเน็ตตอนเชื่อมต่อครั้งแรก เพื่อตรวจว่าลิงก์และโทเค็นถูกต้อง';
      msg.classList.add('error');
      return;
    }

    CONFIG.API_URL = url;
    CONFIG.API_TOKEN = token;
    btn.disabled = true;
    msg.textContent = 'กำลังทดสอบการเชื่อมต่อ...';

    apiGet('ping')
      .then(function () {
        saveConnection(url, token);
        msg.textContent = 'เชื่อมต่อสำเร็จ กำลังเปิดแอป...';
        msg.classList.add('ok');
        setTimeout(function () { location.reload(); }, 600);
      })
      .catch(function (err) {
        CONFIG.API_URL = '';
        CONFIG.API_TOKEN = '';
        btn.disabled = false;
        msg.textContent = 'เชื่อมต่อไม่สำเร็จ: ' + (err.message || err);
        msg.classList.add('error');
      });
  });
}

/** ล้างการเชื่อมต่อ + ข้อมูลในเครื่อง แล้วกลับไปหน้าเชื่อมต่อ (ข้อมูลในชีตไม่กระทบ) */
function resetConnection() {
  var warn = state.outboxCount
    ? 'มี ' + state.outboxCount + ' รายการที่ยังไม่ได้ซิงก์ขึ้นชีต ถ้าตัดการเชื่อมต่อตอนนี้รายการเหล่านั้นจะหายไป\n\nยืนยันตัดการเชื่อมต่อหรือไม่?'
    : 'ตัดการเชื่อมต่อและล้างข้อมูลที่เก็บในเครื่องนี้?\n(ข้อมูลใน Google Sheet ไม่หาย)';
  if (!confirm(warn)) return;

  clearConnection();
  if (db) { try { db.close(); } catch (e) { /* ไม่เป็นไร */ } }
  var req = indexedDB.deleteDatabase(DB_NAME);
  var done = function () { location.reload(); };
  req.onsuccess = done;
  req.onerror = done;
  req.onblocked = done;
}

function init() {
  var conn = loadConnection();
  if (!conn) {
    showSetupScreen();
    return;
  }
  CONFIG.API_URL = conn.url;
  CONFIG.API_TOKEN = conn.token;
  $('app').hidden = false;

  bindEvents();
  $('txDate').value = todayStr();
  $('appVersion').textContent = APP_VERSION;

  openDb()
    .then(loadFromLocal)
    .then(function () {
      // แสดงข้อมูลที่มีในเครื่องทันที (ไม่ต้องรอเน็ต) แล้วค่อยซิงก์เบื้องหลัง
      renderSyncStatus();
      renderCurrentTab();
      if (isOnline()) fullSync();
    })
    .catch(function (err) {
      console.error('init failed', err);
      showToast('เริ่มระบบไม่สำเร็จ: ' + (err.message || err));
    });
}

// ลงทะเบียน service worker เพื่อให้เปิดแอปได้ตอนไม่มีเน็ต
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js')
      .catch(function (err) { console.warn('service worker registration failed', err); });
  });
}

window.addEventListener('DOMContentLoaded', init);
