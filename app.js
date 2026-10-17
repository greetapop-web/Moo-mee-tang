/**
 * app.js — หัวใจของแอป Moo Mee Tang เวอร์ชันติดตั้งบนมือถือ (PWA)
 *
 * แนวคิดหลัก "ออฟไลน์มาก่อน" (offline-first):
 *  1. ข้อมูลทุกอย่างถูกเก็บสำเนาไว้ในเครื่อง (IndexedDB) → เปิดแอปแล้วเห็นข้อมูลทันที ไม่ต้องรอเน็ต
 *  2. เวลาบันทึก/แก้ไข จะอัปเดตข้อมูลในเครื่องก่อนเสมอ แล้วค่อยส่งขึ้น Google Sheet
 *  3. ถ้าตอนนั้นไม่มีเน็ต คำสั่งจะถูกพักไว้ใน "คิว" (outbox) แล้วส่งให้อัตโนมัติเมื่อกลับมามีเน็ต
 *  4. หลังส่งคิวสำเร็จ จะดึงข้อมูลจริงจากชีตมาทับ เพื่อให้ตัวเลขตรงกับชีตเสมอ (ชีตคือความจริง)
 */

var APP_VERSION = '2026-10-15-pwa-17';

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
  { id: 'piggy',  name: 'หมูมีตัง',   dark: false, bar: '#2f9e5b', dots: ['#f1f9ee', '#2f9e5b', '#f07c8e'] },
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

// ===================== ตัวการ์ตูนหมู + สัมผัสตอบสนอง (ตั้งค่าเฉพาะเครื่องนี้) =====================

var MASCOT_KEY = 'moo-mee-tang-mascot';
var HAPTICS_KEY = 'moo-mee-tang-haptics';
function prefOn(key) { try { return localStorage.getItem(key) !== 'off'; } catch (e) { return true; } }
function setPref(key, on) { try { localStorage.setItem(key, on ? 'on' : 'off'); } catch (e) { /* ไม่เป็นไร */ } }
function applyMascot() { document.documentElement.classList.toggle('no-mascot', !prefOn(MASCOT_KEY)); }
applyMascot();

/**
 * สั่นเบา ๆ เวลาแตะ
 * iPhone ไม่ให้เว็บแอปสั่งสั่นตรง ๆ (navigator.vibrate ไม่มีบน iOS) แต่ตั้งแต่ iOS 18
 * การแตะสวิตช์แบบ <input type="checkbox" switch> จะมีการสั่นแบบระบบ — เราจึงแอบกดสวิตช์ที่ซ่อนไว้
 * ต้องเรียกระหว่างที่ผู้ใช้กำลังแตะอยู่เท่านั้น (ในตัวจัดการ click)
 */
var hapticBusy = false;
function haptic() {
  if (!prefOn(HAPTICS_KEY) || hapticBusy) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(8); return; }
    // วิธีเดียวกับไลบรารี ios-haptics: สร้างสวิตช์ซ่อนใน <head> กด 1 ครั้งแล้วลบทิ้ง
    // (ไม่วางใน body และไม่ค้างไว้ จึงไม่ไปแย่งโฟกัสช่องเลือก/ช่องพิมพ์)
    hapticBusy = true;
    var label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch (e) { /* ไม่รองรับ ก็แค่ไม่สั่น */ }
  hapticBusy = false;
}
// เฉพาะปุ่มกด — ไม่รวมช่องเลือก (select) และช่องพิมพ์ เพราะบน iPhone จะทำให้รายการตัวเลือกปิดทันที
var HAPTIC_TARGETS = 'button, .cat-tile, .tx-row, .asset-main, .seg-btn, .menu-tile, .cal-cell, .mascot-tap';
document.addEventListener('click', function (e) {
  if (hapticBusy) return;
  var t = e.target;
  if (!t || !t.closest || t.closest('select, input, textarea, label.switch')) return;
  if (t.closest(HAPTIC_TARGETS)) haptic();
}, true);
// สวิตช์ในแอปเอง: สั่นตอนค่าเปลี่ยน (ไม่ไปกดสวิตช์ซ้อน)
document.addEventListener('change', function (e) {
  if (e.target && e.target.closest && e.target.closest('label.switch')) haptic();
}, true);

// ===================== คลังไอคอนหมวดหมู่ =====================
// ใช้อิโมจิ (บน iPhone แสดงเป็นภาพสีสวยแบบ Apple) — ทำงานออฟไลน์ได้ และเก็บในชีตเป็นตัวอักษรธรรมดา
// ไม่ใช้รูปแทรกในเซลล์ เพราะแบบนั้นแอปอ่านไม่ได้

var ICON_LIBRARY = [
  { name: 'อาหาร', icons: ['🍚','🍜','🍛','🍲','🍱','🍣','🍙','🍘','🥟','🍤','🍳','🥘','🍝','🍔','🍟','🌭','🍕','🥪','🌮','🌯','🥙','🥗','🍗','🍖','🥩','🥓','🍢','🍡','🦐','🦀','🦑','🐟','🥚','🧀','🍞','🥐','🥖','🥯','🥞','🧇','🍿','🥫','🧂'] },
  { name: 'ขนมและผลไม้', icons: ['🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','🍮','🍦','🍧','🍨','🍉','🍎','🍌','🍊','🍇','🍓','🍍','🥭','🥥','🥝','🍒','🍑','🍐','🍋','🫐','🥑','🌽','🥕','🥦','🍄','🥜'] },
  { name: 'เครื่องดื่ม', icons: ['☕','🍵','🧋','🥤','🧃','🥛','🍼','🍺','🍻','🍷','🥂','🍸','🍹','🥃','🍶','🧊','💧'] },
  { name: 'เดินทาง', icons: ['🚗','🚕','🚙','🛻','🚐','🛵','🏍️','🚲','🛴','🚌','🚎','🚆','🚇','🚝','🚄','✈️','🛫','🚢','⛴️','🛳️','🚁','⛽','🅿️','🚦','🛣️','🔧','🛞','🚘','🧳','🗺️','🎫'] },
  { name: 'บ้านและบิล', icons: ['🏠','🏡','🏢','🏘️','🔑','🛏️','🛋️','🪑','🚿','🛁','🚽','🧺','🧹','🧽','🧴','🧻','🪣','💡','🔌','🔋','💧','🔥','❄️','📶','📱','☎️','💻','🖥️','🖨️','📺','📡','🧾','📮','🪴','🔨','🪛','🧰','🗑️'] },
  { name: 'ช้อปปิ้งและแฟชั่น', icons: ['🛍️','🛒','🏬','🏪','👕','👚','👗','👖','🩳','🧥','👔','👙','🩱','👟','👠','👡','🥾','👜','👛','🎒','👒','🧢','🕶️','👓','💄','💅','💍','📿','⌚','🎁','📦','🧸','🪞'] },
  { name: 'สุขภาพและความงาม', icons: ['💊','💉','🩺','🩹','🩸','🏥','🦷','👁️','🧠','🫀','🧪','🔬','🧬','🌡️','😷','💆','💇','🧖','🧴','🪒','💪','🏃','🧘','🏋️','🚴','🏊','🥗'] },
  { name: 'ครอบครัวและสังคม', icons: ['👶','🍼','🧒','👧','👦','👨‍👩‍👧','👨‍👩‍👧‍👦','👵','👴','💑','💒','💝','💌','🎂','🎉','🎊','🤝','🙏','🧧','🎁','💐','🌹','🐶','🐱','🐰','🐹','🐟','🐦','🦴','🐾'] },
  { name: 'ทำบุญและเทศกาล', icons: ['🙏','🛕','📿','🪔','🕯️','🌸','🌼','🪷','🎆','🎇','🧨','🎄','🎃','🏮','🎎','🎐','💮'] },
  { name: 'บันเทิงและงานอดิเรก', icons: ['🎬','🍿','🎮','🕹️','🎲','🧩','🎯','🎳','🎤','🎧','🎵','🎸','🎹','🥁','🎨','🖌️','📷','📸','🎥','📚','📖','✏️','🎭','🎪','🎟️','🎫','🏖️','🏕️','⛺','🏔️','🎢','🎡','🧶','🪡','🌱'] },
  { name: 'กีฬา', icons: ['⚽','🏀','🏈','⚾','🎾','🏐','🏸','🏓','🥊','⛳','🎣','🏄','🏂','⛷️','🛹','🚣','🤿','🏆','🏅','🥇'] },
  { name: 'การศึกษาและงาน', icons: ['🎓','🏫','📚','📝','✏️','🖊️','📐','📏','🗂️','📁','📎','📌','💼','🧑‍💻','🧑‍⚕️','🧑‍🔬','🧑‍🏫','👨‍🍳','🔬','🧪','⏰','📅','🗓️','📊','📈','🖥️'] },
  { name: 'รายรับและการเงิน', icons: ['💵','💴','💶','💷','💰','🪙','💳','💸','🏦','🏧','🧾','📈','📉','💹','💼','🏆','🏅','🎯','🐷','🫙','🧧','➕','➖','💲','🤑','🎰','📮','📃','🧮','⚖️'] },
  { name: 'สัญลักษณ์และอื่นๆ', icons: ['⭐','🌟','✨','💫','❤️','🧡','💛','💚','💙','💜','🤍','🖤','🔶','🔷','🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','📌','🏷️','🔖','🗂️','❓','❗','💯','✅','🔔','🍀','🌈','☀️','🌙','⚡','🔥'] }
];

// ไอคอนสำหรับสินทรัพย์ — วงกลมสีไว้แทนธนาคาร (เช่น 🟢 กสิกร 🔵 กรุงไทย 🟣 ไทยพาณิชย์ 🟡 กรุงศรี)
var ASSET_ICON_LIBRARY = [
  { name: 'เงินสดและกระเป๋า', icons: ['💵','💴','💶','💷','👛','👝','💼','🐷','🫙','🧧','💰','🪙','🎒','👜','🗃️','📦'] },
  { name: 'ธนาคารและบัตร', icons: ['🏦','💳','🏧','📱','📲','💻','🟢','🔵','🟣','🟡','🟠','🔴','🟤','⚫','⚪','🟩','🟦','🟪','🟨','🟧','🟥','🟫'] },
  { name: 'ลงทุนและออม', icons: ['📈','📊','💹','📉','🥇','💎','🏠','🏢','🏘️','🚗','🌱','🌳','🎯','🗓️','⏳','🧮','🪙','🏆','💍','⌚'] },
  { name: 'ประกันและเกษียณ', icons: ['🛡️','☂️','🏥','🧓','👵','👴','🏖️','🌴','⛱️','🔒','🗝️','📜','🩺','👶','🎓'] }
].concat(ICON_LIBRARY);

/** ไอคอนพื้นฐานของสินทรัพย์ที่ยังไม่ได้เลือก — เดาจากชื่อกลุ่ม/ชื่อสินทรัพย์ */
function defaultAssetIcon(asset) {
  var s = String((asset && asset.group) || '') + ' ' + String((asset && asset.name) || '');
  var rules = [
    [/ธนาคาร|บัญชี|bank/i, '🏦'], [/ทอง|gold/i, '🥇'], [/ลงทุน|กองทุน|หุ้น|fund|dime|crypto/i, '📈'],
    [/เกษียณ|บำนาญ|กบข|pvd/i, '🏖️'], [/กันชน|ฉุกเฉิน|ประกัน/i, '🛡️'], [/เก็บ|ออม/i, '🐷'],
    [/true ?money|wallet|e-?wallet|เป๋าตัง|shopee|line ?pay/i, '📱'], [/เงินสด|cash/i, '💵']
  ];
  for (var i = 0; i < rules.length; i++) if (rules[i][0].test(s)) return rules[i][1];
  return '💰';
}

function assetIcon(asset) { return (asset && asset.icon) || defaultAssetIcon(asset); }

/** สินทรัพย์ถูกนับใน "เงินที่ใช้ได้" หรือไม่ — ค่าที่เลือกแยกรายตัวชนะสวิตช์ของกลุ่ม */
function assetCounted(asset, group) {
  if (asset.include === true || asset.include === false) return asset.include;
  return !!(group && group.includeInTotal);
}

/** สรุปการนับของกลุ่ม: 'all' | 'none' | 'some' */
function groupCountState(group) {
  var list = group.assets || [];
  if (!list.length) return group.includeInTotal ? 'all' : 'none';
  var n = list.filter(function (a) { return assetCounted(a, group); }).length;
  return n === list.length ? 'all' : (n === 0 ? 'none' : 'some');
}

// ===================== ไอคอนของฉัน: อีโมจิที่พิมพ์เอง หรือรูปที่อัปโหลด =====================
// รูปถูกย่อเหลือ 96×96 แล้วเก็บเป็นข้อความ (data URL) ในเซลล์ไอคอนเดิมของชีต — ไม่ใช่รูปแทรกในเซลล์
// (รูปแทรกในเซลล์แอปอ่านไม่ได้) จึงซิงก์ไปทุกเครื่องและใช้ออฟไลน์ได้เหมือนอีโมจิ

function isImgIcon(ic) { return /^data:image\//.test(String(ic || '')); }
/** HTML สำหรับแสดงไอคอน — รองรับทั้งอีโมจิและรูป */
function iconHtml(ic) {
  return isImgIcon(ic) ? '<img class="ic-img" src="' + escapeHtml(ic) + '" alt="">' : escapeHtml(ic);
}
/** ไอคอนในข้อความล้วน (เช่นตัวเลือกใน select) — รูปแสดงไม่ได้ จึงใช้ 🖼️ แทน */
function iconText(ic) { return isImgIcon(ic) ? '🖼️' : (ic || ''); }

function libraryHas(ic) {
  return ICON_LIBRARY.concat(ASSET_ICON_LIBRARY).some(function (g) { return g.icons.indexOf(ic) >= 0; });
}
/** ไอคอนที่ผู้ใช้ใส่เอง (ไม่อยู่ในคลัง) ที่ใช้อยู่ในหมวด/สินทรัพย์ตอนนี้ */
function myIcons() {
  var out = [];
  function add(ic) { if (ic && !libraryHas(ic) && out.indexOf(ic) < 0) out.push(ic); }
  ['income', 'expense'].forEach(function (t) { (state.categories[t] || []).forEach(function (c) { add(c.icon); }); });
  allAssetsFlat().forEach(function (a) { add(a.icon); });
  return out;
}

/** ตัดตัวอักษรตัวแรกแบบรู้จักอีโมจิผสม (เช่น 👨‍👩‍👧) */
function firstGrapheme(str) {
  str = String(str || '').trim();
  if (!str) return '';
  try {
    if (window.Intl && Intl.Segmenter) {
      var it = new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(str)[Symbol.iterator]();
      return it.next().value.segment;
    }
  } catch (e) { /* ใช้วิธีสำรอง */ }
  return Array.from(str)[0];
}

/** ย่อรูปเป็นสี่เหลี่ยมจัตุรัส 96×96 (ตัดกลางภาพ) แล้วคืน data URL ขนาดเล็ก */
function imageFileToIcon(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function () { reject(new Error('อ่านรูปไม่สำเร็จ')); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { reject(new Error('เปิดรูปไม่สำเร็จ')); };
      img.onload = function () {
        var S = 96, c = document.createElement('canvas');
        c.width = S; c.height = S;
        var side = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
        var url = c.toDataURL('image/png');
        if (url.length > 30000) url = c.toDataURL('image/jpeg', 0.85);   // เซลล์ชีตเก็บได้ไม่เกิน 50,000 ตัวอักษร
        resolve(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * วาดตัวเลือกไอคอน (ใช้ร่วมกันทั้งหมวดหมู่และสินทรัพย์)
 * ด้านบนมีช่อง "ใส่เอง": พิมพ์/วางอีโมจิ หรือเลือกรูปของฉัน
 */
function renderIconChooser(host, library, current, onPick) {
  var mine = myIcons();
  if (current && !libraryHas(current) && mine.indexOf(current) < 0) mine.unshift(current);
  function grid(icons) {
    return '<div class="icon-grid">' + icons.map(function (ic) {
      return '<button type="button" class="icon-opt' + (ic === current ? ' selected' : '') + '" data-ic="' +
        escapeHtml(ic) + '">' + iconHtml(ic) + '</button>';
    }).join('') + '</div>';
  }
  host.innerHTML =
    '<div class="icon-custom">' +
    '  <div class="icon-custom-title">ใส่ไอคอนเอง</div>' +
    '  <div class="icon-custom-row">' +
    '    <input type="text" class="icon-emoji-input" placeholder="พิมพ์/วางอีโมจิ เช่น 🥑" autocomplete="off">' +
    '    <button type="button" class="chip-btn icon-emoji-use">ใช้</button>' +
    '  </div>' +
    '  <label class="chip-btn icon-photo-btn">📷 ใช้รูปของฉัน<input type="file" accept="image/*" hidden></label>' +
    '  <div class="icon-custom-hint">อีโมจิ: กดปุ่ม 🌐/😀 บนแป้นพิมพ์ iPhone · รูป: ถ่ายใหม่หรือเลือกจากอัลบั้ม (ย่อให้อัตโนมัติ)</div>' +
    '</div>' +
    (mine.length ? '<div class="icon-group-title">ไอคอนของฉัน</div>' + grid(mine) : '') +
    library.map(function (g) {
      return '<div class="icon-group-title">' + escapeHtml(g.name) + '</div>' + grid(g.icons);
    }).join('');

  host.querySelectorAll('.icon-opt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      host.querySelectorAll('.icon-opt.selected').forEach(function (x) { x.classList.remove('selected'); });
      btn.classList.add('selected');
      onPick(btn.dataset.ic);
    });
  });
  var input = host.querySelector('.icon-emoji-input');
  function useTyped() {
    var ic = firstGrapheme(input.value);
    if (!ic) { showToast('พิมพ์หรือวางอีโมจิก่อน'); return; }
    onPick(ic);
  }
  host.querySelector('.icon-emoji-use').addEventListener('click', useTyped);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); useTyped(); } });
  host.querySelector('.icon-photo-btn input').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    imageFileToIcon(f).then(onPick).catch(function (err) { showToast(err.message); });
    e.target.value = '';
  });
}

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
  return apiGet('bootstrap', { monthsBack: CONFIG.MONTHS_TO_CACHE || 2 }).then(applyBootstrap);
}

/** เอาชุดข้อมูลจากชีตมาทับสำเนาในเครื่อง (ใช้ทั้งจาก GET bootstrap และจากคำตอบของ POST แบบซิงก์เร็ว) */
function applyBootstrap(data) {
  return Promise.resolve(data)
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
    })
    .then(function () {
      // รายการที่บันทึกเข้ามา "ระหว่าง" ซิงก์ ยังอยู่ในคิว ไม่อยู่ในข้อมูลจากชีต
      // ใส่กลับเข้าไปให้เห็นต่อ (ป้ายรอซิงก์) ไม่ให้หายไปชั่วขณะ
      return outboxAll().then(function (items) {
        var replayed = 0;
        items.forEach(function (it) {
          if (it.action === 'addTransaction' && it.args && it.args[0]) { addTransactionLocal(it.args[0]); replayed++; }
        });
        if (replayed) return persistLocalState();
      });
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
function flushOutbox(syncMonthsBack) {
  return outboxAll().then(function (items) {
    if (!items.length) return { flushed: 0 };

    var batch = items.map(function (it) {
      return { id: it.id, action: it.action, args: it.args };
    });

    // ขอข้อมูลล่าสุดกลับมาในคำขอเดียวกัน (เซิร์ฟเวอร์รุ่นใหม่จะแนบ bootstrap มาให้)
    var body = { batch: batch };
    if (syncMonthsBack !== undefined) body.sync = { monthsBack: syncMonthsBack };

    return apiPost(body).then(function (data) {
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
        return { flushed: results.length, failures: failures, bootstrap: data && data.bootstrap };
      });
    });
  });
}

/**
 * งานซิงก์เต็มรูปแบบ: ส่งคิวก่อน แล้วค่อยเอาข้อมูลจริงมาทับ
 *
 * ซิงก์เร็ว (v5): ถ้ามีคิวค้าง จะส่งคิว + ขอข้อมูลล่าสุดใน "คำขอเดียว" (เดิมต้อง 2 รอบ)
 * หลังบันทึกรายการ (options.quick) ขอแค่เดือนปัจจุบัน + เดือนที่แก้ ไม่ต้องดึง 3 เดือนทุกครั้ง
 * ถ้ากำลังซิงก์อยู่แล้วมีรายการใหม่เข้ามา จะซิงก์ต่ออีกรอบทันทีหลังรอบแรกจบ (ไม่ค้างรอซิงก์)
 */
function fullSync(options) {
  options = options || {};
  if (!CONFIG.API_URL || !CONFIG.API_TOKEN) return Promise.resolve();
  if (state.syncing) {
    state.syncAgain = true;
    if (options.notify) state.syncAgainNotify = true;
    return state.syncPromise || Promise.resolve();
  }

  state.syncing = true;
  renderSyncStatus();
  var monthsBack = options.quick ? 0 : (CONFIG.MONTHS_TO_CACHE || 2);

  state.syncPromise = flushOutbox(monthsBack)
    .then(function (res) {
      // เซิร์ฟเวอร์รุ่นเก่ายังไม่แนบข้อมูลกลับมา → ดึงแยกแบบเดิม
      if (res && res.bootstrap) return applyBootstrap(res.bootstrap);
      return syncFromServer();
    })
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
    })
    .then(function () {
      if (state.syncAgain) {
        var notify = state.syncAgainNotify;
        state.syncAgain = false;
        state.syncAgainNotify = false;
        return fullSync({ quick: true, notify: notify });
      }
    });
  return state.syncPromise;
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
        fullSync({ quick: true });
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
  var total = 0, grand = 0;
  (state.assetsOverview.groups || []).forEach(function (g) {
    g.subtotal = 0;
    (g.assets || []).forEach(function (a) {
      var b = Number(a.balance) || 0;
      g.subtotal += b;
      grand += b;
      if (assetCounted(a, g)) total += b;
    });
  });
  state.assetsOverview.total = total;
  state.assetsOverview.grandTotal = grand;
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
      else if (it.type === 'expense') { day.expense += amt; expense += amt; }   // การโอนไม่นับ
    });
  });
  month.days = (month.days || []).filter(function (d) { return (d.items || []).length > 0; });
  month.days.sort(function (a, b) { return a.key < b.key ? 1 : (a.key > b.key ? -1 : 0); });
  month.totalIncome = income;
  month.totalExpense = expense;
  month.balance = income - expense;
}

/** ผลของรายการต่อยอดสินทรัพย์ ตรงกับ txEffects_ ฝั่งเซิร์ฟเวอร์ */
function txEffects(type, account, toAccount, amount) {
  amount = Number(amount) || 0;
  if (type === 'transfer') return [[account, -amount], [toAccount, amount]];
  return [[account, type === 'income' ? amount : -amount]];
}
function applyEffectsLocal(effects, sign) {
  effects.forEach(function (e) { applyAssetDeltaLocal(e[0], sign * e[1]); });
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
    category: tx.type === 'transfer' ? 'โอนเงิน' : tx.category,
    account: tx.account,
    toAccount: tx.type === 'transfer' ? tx.toAccount : '',
    amount: Number(tx.amount) || 0,
    note: tx.note || ''
  });

  recomputeMonthTotals(month);
  applyEffectsLocal(txEffects(tx.type, tx.account, tx.toAccount, tx.amount), 1);
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
  applyEffectsLocal(txEffects(removed.type, removed.account, removed.toAccount, removed.amount), -1);
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
  updateCalToggle();
}

/** ไอคอนปฏิทินข้างชื่อเดือน: แตะชื่อเดือนเพื่อเปิด/ปิดปฏิทิน (เฉพาะหน้าหลัก) */
function updateCalToggle() {
  var btn = $('monthLabelBtn');
  if (!btn) return;
  var onHome = state.tab === 'home';
  btn.classList.toggle('clickable', onHome);
  btn.classList.toggle('active', onHome && homeView() === 'calendar');
  $('calToggleIcon').hidden = !onHome;
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

  // ----- มุมมองรายการ / ปฏิทิน -----
  var view = homeView();
  updateCalToggle();
  var calHost = $('homeCalendar');
  var filterBar = $('dayFilterBar');
  var monthPrefix = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0') + '-';
  if (state.selectedDay && state.selectedDay.indexOf(monthPrefix) !== 0) state.selectedDay = null;

  if (view === 'calendar') {
    calHost.hidden = false;
    calHost.innerHTML = buildCalendarHtml(state.year, state.monthIndex, {
      selected: state.selectedDay, marks: monthMarks(month)
    });
    calHost.querySelectorAll('.cal-cell[data-key]').forEach(function (c) {
      c.addEventListener('click', function () {
        // แตะวันเดิมซ้ำ = ยกเลิกเลือก กลับไปดูทั้งเดือน
        state.selectedDay = (state.selectedDay === c.dataset.key) ? null : c.dataset.key;
        renderHome();
      });
    });
    if (state.selectedDay) {
      var sel = state.selectedDay;
      days = days.filter(function (d) { return d.key === sel; });
      filterBar.hidden = false;
      $('dayFilterLabel').textContent = thaiDateLabel(sel);
    } else {
      filterBar.hidden = true;
    }
  } else {
    calHost.hidden = true;
    filterBar.hidden = true;
  }

  $('homeEmptyPig').hidden = !!days.length;
  if (!days.length) {
    empty.hidden = false;
    if (view === 'calendar' && state.selectedDay && month) {
      empty.textContent = 'ไม่มีรายการในวันนี้ — กดปุ่ม ✏️ เพื่อบันทึกของวันที่เลือก';
    } else {
      empty.textContent = month
        ? 'ยังไม่มีรายการในเดือนนี้ กดปุ่ม ✏️ เพื่อเริ่มบันทึก'
        : (isOnline() ? 'กำลังโหลดข้อมูลเดือนนี้...' : 'ยังไม่มีข้อมูลเดือนนี้ในเครื่อง ต่อเน็ตแล้วกด ⟳ เพื่อดึงข้อมูล');
    }
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
      var isTransfer = item.type === 'transfer';
      var sign = (item.type === 'expense') ? '-' : '';
      row.innerHTML =
        '<div class="tx-icon">' + iconHtml(isTransfer ? '🔁' : categoryIcon(item.type, item.category)) + '</div>' +
        '<div class="tx-info">' +
        '  <div class="tx-cat ' + item.type + '">' + escapeHtml(isTransfer ? 'โอนเงิน' : item.category) +
             (item.pending ? '<span class="pending-badge">รอซิงก์</span>' : '') + '</div>' +
        '  <div class="tx-account">' + escapeHtml(isTransfer ? item.account + ' → ' + item.toAccount : item.account) +
             (item.note ? ' · ' + escapeHtml(item.note) : '') + '</div>' +
        '</div>' +
        '<div class="tx-amount ' + item.type + '">' + sign + escapeHtml(formatBaht(item.amount)) + '</div>' +
        '<button class="tx-delete" aria-label="ลบรายการ">✕</button>';

      row.querySelector('.tx-delete').addEventListener('click', function (e) {
        e.stopPropagation();
        if (item.pending) {
          showToast('รายการนี้ยังรอซิงก์อยู่ ลบได้หลังซิงก์ขึ้นชีตแล้ว');
          return;
        }
        confirmDeleteTx(item);
      });
      row.addEventListener('click', function () {
        if (item.pending) {
          showToast('รายการนี้ยังรอซิงก์อยู่ แก้ไขได้หลังซิงก์ขึ้นชีตแล้ว');
          return;
        }
        openTxModal({ item: item, dateStr: day.key });
      });

      card.appendChild(row);
    });

    group.appendChild(card);
    container.appendChild(group);
  });
}

// ===================== ปฏิทิน (เริ่มสัปดาห์วันอาทิตย์) =====================

var CAL_HEAD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
var HOME_VIEW_KEY = 'moo-mee-tang-home-view';

function dateKey(y, m, d) {
  return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** ย่อตัวเลขให้พอดีช่องปฏิทิน เช่น 1,250 / 12.5k / 125k */
function formatCompact(n) {
  n = Math.round(Number(n) || 0);
  if (n >= 100000) return Math.round(n / 1000) + 'k';
  if (n >= 10000) return (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + 'k';
  return n.toLocaleString('en-US');
}

/**
 * สร้างตารางปฏิทิน 1 เดือน
 * opts: { selected, marks: { 'yyyy-mm-dd': {income, expense} }, compact }
 */
function buildCalendarHtml(year, monthIndex, opts) {
  opts = opts || {};
  var first = new Date(year, monthIndex, 1).getDay();      // 0 = อาทิตย์ → ช่องแรก
  var days = new Date(year, monthIndex + 1, 0).getDate();
  var today = todayStr();
  var html = '<div class="cal-grid' + (opts.compact ? ' compact' : '') + '">';
  CAL_HEAD.forEach(function (h, i) {
    html += '<div class="cal-head' + (i === 0 ? ' sun' : (i === 6 ? ' sat' : '')) + '">' + h + '</div>';
  });
  for (var b = 0; b < first; b++) html += '<div class="cal-cell blank"></div>';
  for (var d = 1; d <= days; d++) {
    var key = dateKey(year, monthIndex, d);
    var dow = (first + d - 1) % 7;
    var mk = opts.marks && opts.marks[key];
    var cls = 'cal-cell' + (key === today ? ' today' : '') + (key === opts.selected ? ' selected' : '') +
      (dow === 0 ? ' sun' : '') + (mk ? ' has-data' : '') + (key > today ? ' future' : '');
    html += '<button type="button" class="' + cls + '" data-key="' + key + '"><span class="cal-num">' + d + '</span>';
    if (mk && !opts.compact) {
      if (mk.expense) html += '<span class="cal-amt exp">-' + formatCompact(mk.expense) + '</span>';
      if (mk.income) html += '<span class="cal-amt inc">+' + formatCompact(mk.income) + '</span>';
    } else if (mk && opts.compact) {
      html += '<span class="cal-dot"></span>';
    }
    html += '</button>';
  }
  return html + '</div>';
}

function monthMarks(month) {
  var marks = {};
  ((month && month.days) || []).forEach(function (day) {
    if ((day.items || []).length) marks[day.key] = { income: day.income, expense: day.expense };
  });
  return marks;
}

function homeView() {
  try { return localStorage.getItem(HOME_VIEW_KEY) || 'list'; } catch (e) { return 'list'; }
}

function setHomeView(v) {
  try { localStorage.setItem(HOME_VIEW_KEY, v); } catch (e) { /* ไม่เป็นไร */ }
  // เข้าโหมดปฏิทินในเดือนปัจจุบัน → เลือก "วันนี้" ไว้ให้เลย
  if (v === 'calendar' && !state.selectedDay) {
    var t = todayStr();
    if (t.indexOf(state.year + '-' + String(state.monthIndex + 1).padStart(2, '0')) === 0) state.selectedDay = t;
  }
  renderHome();
}

/** วันที่ตั้งต้นของรายการใหม่: วันที่เลือกในปฏิทิน (ถ้ามี) ไม่งั้นวันนี้ */
function defaultNewTxDate() {
  if (homeView() === 'calendar' && state.selectedDay && state.tab === 'home') return state.selectedDay;
  return todayStr();
}

function thaiDateLabel(str) {
  var d = parseDateStr(str);
  var label = THAI_DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + THAI_MONTHS_SHORT[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  var t = todayStr();
  if (str === t) label += ' (วันนี้)';
  else {
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (str === dateKey(y.getFullYear(), y.getMonth(), y.getDate())) label += ' (เมื่อวาน)';
  }
  return label;
}

// ----- ตัวเลือกวันที่ในฟอร์มรายการ (แทนปฏิทินของ iPhone ที่เริ่มวันจันทร์ตามการตั้งค่าเครื่อง) -----

var datePicker = { year: 0, monthIndex: 0 };

function setTxDate(str) {
  $('txDate').value = str;
  var d = parseDateStr(str);
  $('txDateBtn').textContent = str === todayStr() ? '📅 วันนี้' : '📅 ' + THAI_DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + THAI_MONTHS_SHORT[d.getMonth()];
  $('txDateBtn').title = thaiDateLabel(str);
  $('txDatePicker').hidden = true;
  $('txDateBtn').classList.remove('open');
}

function toggleDatePicker() {
  var pk = $('txDatePicker');
  if (!pk.hidden) { pk.hidden = true; $('txDateBtn').classList.remove('open'); return; }
  var d = parseDateStr($('txDate').value || todayStr());
  datePicker.year = d.getFullYear();
  datePicker.monthIndex = d.getMonth();
  renderDatePicker();
  pk.hidden = false;
  if ($('txMiddle')) $('txMiddle').scrollTop = 0;
  $('txDateBtn').classList.add('open');
}

function renderDatePicker() {
  $('dpLabel').textContent = THAI_MONTHS_FULL[datePicker.monthIndex] + ' ' + (datePicker.year + 543);
  var grid = $('dpGrid');
  grid.innerHTML = buildCalendarHtml(datePicker.year, datePicker.monthIndex, {
    selected: $('txDate').value,
    compact: true,
    marks: monthMarks(state.months[monthKey(datePicker.year, datePicker.monthIndex)])
  });
  grid.querySelectorAll('.cal-cell[data-key]').forEach(function (c) {
    c.addEventListener('click', function () { setTxDate(c.dataset.key); });
  });
}

function shiftDatePicker(delta) {
  datePicker.monthIndex += delta;
  if (datePicker.monthIndex < 0) { datePicker.monthIndex = 11; datePicker.year--; }
  if (datePicker.monthIndex > 11) { datePicker.monthIndex = 0; datePicker.year++; }
  renderDatePicker();
}

/** ข้อมูลยืนยันตัวรายการ: เวลาบันทึก + ค่าเดิม — เซิร์ฟเวอร์ใช้หาแถวให้ถูกแม้แถวจะขยับไปแล้ว */
function expectedOf(item) {
  return { key: item.key || '', type: item.type, category: item.category, amount: item.amount };
}

function confirmDeleteTx(item) {
  if (!confirm('ลบรายการนี้หรือไม่?')) return Promise.resolve(false);
  var month = currentMonth();
  if (!month) return;
  var key = monthKey(state.year, state.monthIndex);

  return performWrite(
    'deleteTransaction',
    [month.sheetName, item.rowIndex, expectedOf(item)],
    function () { deleteTransactionLocal(key, item.rowIndex); },
    'ลบรายการ ' + item.category
  ).then(function () { showToast('ลบรายการแล้ว'); return true; });
}

function renderAssets() {
  var data = state.assetsOverview || { total: 0, groups: [] };
  // คำนวณใหม่ในเครื่องเสมอ: รองรับข้อมูลจากเซิร์ฟเวอร์รุ่นเก่าที่ยังไม่รู้จักการเลือกรายตัว
  recomputeAssetTotals();
  $('assetsTotal').textContent = formatBaht(data.total);
  $('assetsGrandTotal').textContent = formatBaht(data.grandTotal);

  var TAG = { none: 'ไม่รวมยอด', some: 'รวมบางส่วน', all: '' };

  $('assetsByGroup').innerHTML = (data.groups || []).map(function (g) {
    var st = groupCountState(g);
    var note = st === 'all' ? '' : ' (' + TAG[st] + ')';
    return '<div class="asset-type-pill">' + escapeHtml(g.name + note) +
      ': <b>' + escapeHtml(formatBaht(g.subtotal)) + '</b></div>';
  }).join('');

  var list = $('assetList');
  list.innerHTML = '';

  (data.groups || []).forEach(function (g) {
    var block = document.createElement('div');
    block.className = 'asset-group-block';
    var st = groupCountState(g);

    var header = document.createElement('div');
    header.className = 'asset-group-header';
    header.innerHTML = '<span>' + escapeHtml(g.name) +
      (st === 'all' ? '' : '<span class="excluded-tag">' + TAG[st] + '</span>') + '</span>' +
      '<span>' + escapeHtml(formatBaht(g.subtotal)) + '</span>';
    block.appendChild(header);

    (g.assets || []).forEach(function (a, idx) {
      var counted = assetCounted(a, g);
      var card = document.createElement('div');
      // ป้าย "ไม่นับ" แสดงเฉพาะกลุ่มที่นับบางส่วน (ถ้าทั้งกลุ่มไม่นับ ป้ายที่หัวกลุ่มบอกแล้ว)
      card.className = 'asset-card' + (counted ? '' : ' not-counted');
      card.innerHTML =
        '<div class="asset-order-btns">' +
        '  <button class="order-btn up"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
        '  <button class="order-btn down"' + (idx === g.assets.length - 1 ? ' disabled' : '') + '>▼</button>' +
        '</div>' +
        '<div class="asset-main">' +
        '  <div class="asset-icon">' + iconHtml(assetIcon(a)) + '</div>' +
        '  <div class="asset-name">' + escapeHtml(a.name) +
             (!counted && st === 'some' ? '<span class="excluded-tag small">ไม่นับ</span>' : '') + '</div>' +
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

// ===================== หน้าเพิ่มเติม: เมนูไอคอน =====================

var MORE_MENU = [
  { label: 'หมวดหมู่', icon: 'categories', page: 'categories' },
  { label: 'บัญชี', icon: 'accounts', tab: 'assets' },
  { label: 'โอนเงิน', icon: 'transfer', action: function () { openTxModal(null); setTxType('transfer'); applyLastAccounts('transfer'); renderTxPickers(); } },
  { label: 'จัดการกลุ่ม', icon: 'groups', action: function () { renderGroupsManageUI(); openModal('groupsModal'); } },
  { label: 'การวิเคราะห์', icon: 'analysis', tab: 'analysis' },
  { label: 'ธีมสี', icon: 'theme', page: 'theme' },
  { label: 'การตั้งค่า', icon: 'settings', page: 'settings' },
  { label: 'ซิงก์ข้อมูล', icon: 'sync', page: 'sync' },
  { label: 'เกี่ยวกับ', icon: 'about', page: 'about' }
];

function renderMoreMenu() {
  var el = $('moreMenu');
  var icons = window.MMT_ICONS || {};
  el.innerHTML = MORE_MENU.map(function (m, i) {
    var badge = (m.page === 'sync' && state.outboxCount) ? '<span class="menu-badge">' + state.outboxCount + '</span>' : '';
    return '<button class="menu-tile" data-i="' + i + '">' + badge +
      '<span class="menu-icon">' + (icons[m.icon] || '') + '</span><span class="menu-label">' + escapeHtml(m.label) + '</span></button>';
  }).join('');
  el.querySelectorAll('.menu-tile').forEach(function (b) {
    b.addEventListener('click', function () {
      var m = MORE_MENU[Number(b.dataset.i)];
      if (m.page) openMorePage(m.page);
      else if (m.tab) switchTab(m.tab);
      else if (m.action) m.action();
    });
  });
}

function openMorePage(name) {
  state.morePage = name;
  $('moreMenu').hidden = !!name;
  $('moreHello').hidden = !!name;
  document.querySelectorAll('.more-page').forEach(function (p) { p.hidden = p.dataset.page !== name; });
  if (name === 'settings') {
    $('hapticsToggle').checked = prefOn(HAPTICS_KEY);
    $('mascotToggle').checked = prefOn(MASCOT_KEY);
  }
  window.scrollTo(0, 0);
}

function renderMore() {
  renderMoreMenu();
  openMorePage(state.morePage || null);
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
      '<span class="cat-icon">' + iconHtml(c.icon || categoryIcon(type, '')) + '</span>' +
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

// ----- เรียงลำดับหมวดหมู่ -----
// ขยับในหน้าต่างได้หลายครั้ง แล้วกด "บันทึกลำดับ" ทีเดียว → ส่งขึ้นชีตเป็นคำสั่งเดียว

var reorderEdit = { type: 'expense', list: [] };

function openReorderModal(type) {
  reorderEdit.type = type;
  reorderEdit.list = (state.categories[type] || []).slice();
  $('reorderModalTitle').textContent = 'เรียงลำดับหมวด' + (type === 'income' ? 'รายรับ' : 'รายจ่าย');
  renderReorderList();
  openModal('reorderModal');
}

function renderReorderList() {
  var list = reorderEdit.list;
  var el = $('reorderList');
  el.innerHTML = list.map(function (c, i) {
    return '<div class="reorder-row">' +
      '<span class="reorder-num">' + (i + 1) + '</span>' +
      '<span class="cat-icon">' + iconHtml(c.icon || categoryIcon(reorderEdit.type, '')) + '</span>' +
      '<span class="reorder-name">' + escapeHtml(c.name) + '</span>' +
      '<button class="order-btn big" data-i="' + i + '" data-d="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="เลื่อนขึ้น">▲</button>' +
      '<button class="order-btn big" data-i="' + i + '" data-d="1"' + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="เลื่อนลง">▼</button>' +
      '</div>';
  }).join('');
  el.querySelectorAll('.order-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var i = Number(btn.dataset.i), j = i + Number(btn.dataset.d);
      if (j < 0 || j >= list.length) return;
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      renderReorderList();
    });
  });
}

function saveReorder() {
  var type = reorderEdit.type;
  var names = reorderEdit.list.map(function (c) { return c.name; });
  var before = (state.categories[type] || []).map(function (c) { return c.name; });
  if (names.join('\u0000') === before.join('\u0000')) { closeModal('reorderModal'); return; }

  performWrite('reorderCategories', [type, names], function () {
    state.categories[type] = reorderEdit.list.slice();
  }, 'เรียงลำดับหมวดหมู่').then(function () {
    closeModal('reorderModal');
    showToast('บันทึกลำดับแล้ว');
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
  $('categoryIconPreview').innerHTML = iconHtml(categoryEdit.icon);
  renderIconChooser($('iconPicker'), ICON_LIBRARY, categoryEdit.icon, function (ic) {
    categoryEdit.icon = ic;
    $('categoryIconPreview').innerHTML = iconHtml(ic);
    var input = $('iconPicker').querySelector('.icon-emoji-input');
    if (!isImgIcon(ic) && input && input.value) showToast('เลือกไอคอน ' + ic + ' แล้ว');
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
          escapeHtml(iconText(c.icon)) + ' ' + escapeHtml(c.name) + '</option>';
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
  var assets = allAssetsFlat();
  var html = assets.length
    ? assets.map(function (a) {
        return '<option value="' + escapeHtml(a.name) + '">' +
          escapeHtml(iconText(assetIcon(a)) + ' ' + a.name + '  ·  ' + formatBaht(a.balance)) + '</option>';
      }).join('')
    : '<option value="">— เพิ่มสินทรัพย์ในแท็บสินทรัพย์ก่อน —</option>';
  ['txAccount', 'txToAccount'].forEach(function (id) {
    var sel = $(id);
    if (!sel) return;
    sel.innerHTML = html;
    sel.selectedIndex = 0;
  });
  // ปลายทางเริ่มต้นไม่ให้ซ้ำกับต้นทาง
  if (assets.length > 1 && $('txToAccount')) $('txToAccount').selectedIndex = 1;
}

function getCurrentTxType() {
  var active = document.querySelector('#txTypeSegment .seg-btn.active');
  return active ? active.dataset.type : 'expense';
}

/** เปิด/ปิดหน้าต่างแบบเลื่อนขึ้นจากด้านล่าง (ปิด = เลื่อนลงก่อนแล้วค่อยหาย) */
function openModal(id) {
  var el = $(id);
  clearTimeout(el._closeTimer);
  el.classList.remove('closing');
  el.classList.add('open');
}
function closeModal(id) {
  var el = $(id);
  if (!el.classList.contains('open')) return;
  el.classList.add('closing');
  clearTimeout(el._closeTimer);
  el._closeTimer = setTimeout(function () { el.classList.remove('open', 'closing'); }, 200);
  if (id === 'txModal') hideCalc();
}

// ===================== เครื่องคิดเลขในช่องจำนวนเงิน =====================

var CALC_OPS = '+−×÷';

/** คำนวณนิพจน์ เช่น "120+35×2" → 190 (คูณ/หารก่อน บวก/ลบทีหลัง) คืน NaN ถ้าไม่ถูกต้อง */
function calcEval(str) {
  str = String(str || '').replace(/,/g, '').replace(/\s/g, '').replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
  if (!str) return NaN;
  if (CALC_OPS.indexOf(str.slice(-1)) >= 0) str = str.slice(0, -1);   // ลงท้ายด้วยเครื่องหมาย → ตัดทิ้ง
  var nums = [], ops = [], cur = '';
  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    if (CALC_OPS.indexOf(c) >= 0) {
      if (cur === '') return NaN;
      nums.push(parseFloat(cur)); ops.push(c); cur = '';
    } else if (/[0-9.]/.test(c)) cur += c;
    else return NaN;
  }
  if (cur === '' || cur === '.') return NaN;
  nums.push(parseFloat(cur));
  if (nums.some(isNaN)) return NaN;
  // คูณ/หารก่อน
  var n2 = [nums[0]], o2 = [];
  for (var j = 0; j < ops.length; j++) {
    if (ops[j] === '×') n2[n2.length - 1] *= nums[j + 1];
    else if (ops[j] === '÷') { if (nums[j + 1] === 0) return NaN; n2[n2.length - 1] /= nums[j + 1]; }
    else { o2.push(ops[j]); n2.push(nums[j + 1]); }
  }
  var r = n2[0];
  for (var k = 0; k < o2.length; k++) r = (o2[k] === '+') ? r + n2[k + 1] : r - n2[k + 1];
  return Math.round(r * 100) / 100;
}

function calcPress(key) {
  var input = $('txAmount');
  var v = input.value;
  var last = v.slice(-1);
  var curNum = v.split(/[+−×÷]/).pop();
  if (/^[0-9]$/.test(key)) {
    if (/\.\d\d$/.test(curNum)) return;              // ทศนิยมได้แค่ 2 ตำแหน่ง
    if (curNum === '0') v = v.slice(0, -1);              // ไม่ให้มี 0 นำหน้า เช่น 05
    v += key;
  } else if (key === '.') {
    if (curNum.indexOf('.') >= 0) return;
    v += (curNum === '' ? '0.' : '.');
  } else if (CALC_OPS.indexOf(key) >= 0) {
    if (!v) return;
    v = (CALC_OPS.indexOf(last) >= 0 || last === '.') ? v.slice(0, -1) + key : v + key;
  } else if (key === '⌫') {
    v = v.slice(0, -1);
  } else if (key === 'C') {
    v = '';
  } else if (key === '=' || key === 'ok') {
    var r = calcEval(v);
    if (isFinite(r)) v = String(r);
    if (key === 'ok') { input.value = v; updateCalcPreview(); hideCalc(); return; }
  }
  input.value = v;
  updateCalcPreview();
}

function updateCalcPreview() {
  var v = $('txAmount').value;
  var hasOp = /[+−×÷]/.test(v.slice(0, -1)) || (/[+−×÷]/.test(v) && !/[+−×÷]$/.test(v));
  var r = calcEval(v);
  $('calcPreview').textContent = (hasOp && isFinite(r)) ? '= ' + formatBaht(r) : '';
}

// แผงเครื่องคิดเลขแสดงตลอดในหน้าบันทึกแบบเต็มจอ (เหมือนแอปบันทึกเงินทั่วไป)
function showCalc() { /* แสดงอยู่แล้ว */ }
function hideCalc() { /* ไม่ซ่อน */ }

// ===================== หน้าบันทึก: ไทล์หมวดหมู่ + ชิปบัญชี + หน้าต่างเลือกบัญชี =====================

function assetByName(name) {
  var f = findAssetLocal(name);
  return f ? f.asset : null;
}

function acctHtml(name, small) {
  var a = assetByName(name);
  if (!name) return '<span class="acct-name">เลือกบัญชี</span>';
  return '<span class="acct-icon">' + iconHtml(a ? assetIcon(a) : '💰') + '</span>' +
    '<span class="acct-text"><span class="acct-name">' + escapeHtml(name) + '</span>' +
    (a ? '<span class="acct-bal">' + escapeHtml(formatBaht(a.balance)) + '</span>' : '') + '</span>';
}

function renderTxCatGrid() {
  var sel = $('txCategory'), grid = $('txCatGrid');
  if (!sel || !grid) return;
  var type = getCurrentTxType();
  grid.innerHTML = [].map.call(sel.options, function (o) {
    if (!o.value) return '<div class="tx-cat-empty">' + escapeHtml(o.textContent) + '</div>';
    return '<button type="button" class="tx-cat' + (o.value === sel.value ? ' selected' : '') + '" data-v="' + escapeHtml(o.value) + '">' +
      '<span class="cat-icon">' + iconHtml(categoryIcon(type, o.value)) + '</span>' +
      '<span class="cat-name">' + escapeHtml(o.value) + '</span></button>';
  }).join('');
  grid.querySelectorAll('.tx-cat').forEach(function (b) {
    b.addEventListener('click', function () {
      sel.value = b.dataset.v;
      renderTxCatGrid();
    });
  });
}

function renderTxAccounts() {
  if (!$('txAccountBtn')) return;
  var from = $('txAccount').value, to = $('txToAccount').value;
  $('txAccountBtn').innerHTML = acctHtml(from);
  $('fromAcctCard').innerHTML = '<span class="acct-cap">จากบัญชี</span>' + acctHtml(from);
  $('toAcctCard').innerHTML = '<span class="acct-cap">ไปบัญชี</span>' + acctHtml(to);
}

function renderTxPickers() { renderTxCatGrid(); renderTxAccounts(); }

var acctPickTarget = 'txAccount';
function openAccountPicker(selectId) {
  acctPickTarget = selectId;
  var cur = $(selectId).value;
  var type = getCurrentTxType();
  $('accountPickerTitle').textContent = selectId === 'txToAccount' ? 'โอนไปบัญชี' : (type === 'transfer' ? 'โอนจากบัญชี' : 'เลือกบัญชี');
  var html = '';
  (state.assetsOverview.groups || []).forEach(function (g) {
    if (!(g.assets || []).length) return;
    html += '<div class="acct-group">' + escapeHtml(g.name) + '</div>';
    g.assets.forEach(function (a) {
      html += '<button type="button" class="acct-row' + (a.name === cur ? ' selected' : '') + '" data-v="' + escapeHtml(a.name) + '">' +
        '<span class="acct-icon">' + iconHtml(assetIcon(a)) + '</span><span class="acct-name">' + escapeHtml(a.name) + '</span>' +
        '<span class="acct-bal">' + escapeHtml(formatBaht(a.balance)) + '</span><span class="acct-check">' + (a.name === cur ? '✓' : '') + '</span></button>';
    });
  });
  $('accountPickerList').innerHTML = html || '<div class="empty-state">ยังไม่มีสินทรัพย์ เพิ่มได้ที่แท็บสินทรัพย์</div>';
  $('accountPickerList').querySelectorAll('.acct-row').forEach(function (b) {
    b.addEventListener('click', function () {
      var sel = $(acctPickTarget);
      selectIfExists(sel, b.dataset.v);
      renderTxAccounts();
      closeModal('accountPickerModal');
    });
  });
  openModal('accountPickerModal');
}

// ===================== จำบัญชีที่ใช้ล่าสุด (เฉพาะเครื่องนี้) =====================

var LAST_TX_KEY = 'moo-mee-tang-last-tx';
function loadLastTx() { try { return JSON.parse(localStorage.getItem(LAST_TX_KEY)) || {}; } catch (e) { return {}; } }
function saveLastTx(tx) {
  var last = loadLastTx();
  if (tx.type === 'transfer') { last.transferFrom = tx.account; last.transferTo = tx.toAccount; }
  else last.account = tx.account;
  try { localStorage.setItem(LAST_TX_KEY, JSON.stringify(last)); } catch (e) { /* ไม่เป็นไร */ }
}
/** เลือกบัญชีที่จำไว้ (ถ้ายังมีอยู่) */
function selectIfExists(sel, value) {
  if (!value) return;
  if ([].some.call(sel.options, function (o) { return o.value === value; })) sel.value = value;
}
function applyLastAccounts(type) {
  var last = loadLastTx();
  if (type === 'transfer') {
    selectIfExists($('txAccount'), last.transferFrom || last.account);
    selectIfExists($('txToAccount'), last.transferTo);
  } else {
    selectIfExists($('txAccount'), last.account);
  }
}

var txEdit = null;   // null = เพิ่มรายการใหม่, ไม่ใช่ null = กำลังแก้ไขรายการเดิม

/** สลับรายจ่าย/รายรับ: เปลี่ยนสีฟอร์ม และรายการหมวดหมู่ให้ตรงประเภท */
function setTxType(type) {
  document.querySelectorAll('#txTypeSegment .seg-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.type === type);
  });
  var modal = $('txModal');
  modal.classList.toggle('type-expense', type === 'expense');
  modal.classList.toggle('type-income', type === 'income');
  modal.classList.toggle('type-transfer', type === 'transfer');
  var isTransfer = type === 'transfer';
  $('txCategoryRow').hidden = isTransfer;
  $('txToAccountRow').hidden = !isTransfer;
  $('txAccountLabel').textContent = isTransfer ? 'จากบัญชี' : 'บัญชี/สินทรัพย์';
  if (!isTransfer) populateCategorySelect();
  renderTxPickers();
}

function selectOrAdd(sel, value, label) {
  if (!value) return;
  var exists = [].some.call(sel.options, function (o) { return o.value === value; });
  if (!exists) {
    var o = document.createElement('option');
    o.value = value; o.textContent = label || value;
    sel.appendChild(o);
  }
  sel.value = value;
}

/** edit = { item, dateStr } เพื่อแก้ไขรายการเดิม หรือไม่ส่งอะไรมาเพื่อเพิ่มรายการใหม่ */
function openTxModal(edit) {
  txEdit = (edit && edit.item) ? {
    item: edit.item,
    dateStr: edit.dateStr,
    sheetName: (currentMonth() || {}).sheetName,
    monthKey: monthKey(state.year, state.monthIndex)
  } : null;

  $('receiptStatus').textContent = '';
  $('txModalTitle').textContent = txEdit ? 'แก้ไขรายการ' : 'เพิ่มรายการ';
  $('saveTxBtn').textContent = 'บันทึก';
  $('deleteTxBtn').hidden = !txEdit;

  if (txEdit) {
    var it = txEdit.item;
    setTxType(it.type);
    populateAccountSelect();
    setTxDate(txEdit.dateStr);
    $('txAmount').value = it.amount;
    $('txNote').value = it.note || '';
    // หมวด/บัญชีที่ถูกลบไปแล้วก็ยังแสดงค่าเดิมให้ ไม่เปลี่ยนเองโดยไม่รู้ตัว
    if (it.type !== 'transfer') selectOrAdd($('txCategory'), it.category, iconText(categoryIcon(it.type, it.category)) + ' ' + it.category);
    selectOrAdd($('txAccount'), it.account);
    if (it.type === 'transfer') selectOrAdd($('txToAccount'), it.toAccount);
  } else {
    // กดดินสอ = เริ่มที่ "รายจ่าย" เสมอ แต่บัญชีจำจากครั้งล่าสุด
    setTxType('expense');
    populateAccountSelect();
    applyLastAccounts('expense');
    setTxDate(defaultNewTxDate());
    $('txAmount').value = '';
    $('txNote').value = '';
  }
  updateCalcPreview();
  $('txDatePicker').hidden = true;
  renderTxPickers();
  $('txMiddle').scrollTop = 0;
  openModal('txModal');
}

function saveTransaction() {
  var amount = calcEval($('txAmount').value);
  if (!isFinite(amount) || amount <= 0) { showToast('กรุณาระบุจำนวนเงิน'); showCalc(); return; }
  $('txAmount').value = String(amount);
  var type = getCurrentTxType();
  var category = type === 'transfer' ? 'โอนเงิน' : $('txCategory').value;
  if (!category) { showToast('กรุณาเลือกหมวดหมู่'); return; }

  var tx = {
    dateStr: $('txDate').value || todayStr(),
    type: type,
    category: category,
    account: $('txAccount').value,
    amount: amount,
    note: $('txNote').value
  };
  if (type === 'transfer') {
    tx.toAccount = $('txToAccount').value;
    if (!tx.account || !tx.toAccount) { showToast('กรุณาเลือกบัญชีต้นทางและปลายทาง'); return; }
    if (tx.account === tx.toAccount) { showToast('บัญชีต้นทางและปลายทางต้องไม่ซ้ำกัน'); return; }
  }

  // เด้งไปเดือนของรายการที่เพิ่ง [บันทึก] เพื่อให้เห็นผลทันทีถ้าบันทึกย้อนเดือน
  var d = parseDateStr(tx.dateStr);

  if (txEdit) {
    var ed = txEdit;
    saveLastTx(tx);
    state.year = d.getFullYear();
    state.monthIndex = d.getMonth();
    performWrite('updateTransaction', [ed.sheetName, ed.item.rowIndex, expectedOf(ed.item), tx], function () {
      deleteTransactionLocal(ed.monthKey, ed.item.rowIndex);
      addTransactionLocal(tx);
    }, 'แก้ไข ' + ed.item.category).then(function () {
      txEdit = null;
      closeModal('txModal');
      showToast(isOnline() ? 'แก้ไขรายการแล้ว' : 'แก้ไขในเครื่องแล้ว จะซิงก์ให้เมื่อมีเน็ต');
    });
    return;
  }

  state.year = d.getFullYear();
  state.monthIndex = d.getMonth();
  saveLastTx(tx);
  if (homeView() === 'calendar') state.selectedDay = tx.dateStr;

  performWrite('addTransaction', [tx], function () { addTransactionLocal(tx); },
    tx.type === 'transfer' ? 'โอน ' + tx.account + ' → ' + tx.toAccount : 'บันทึก ' + tx.category
  ).then(function () {
    closeModal('txModal');
    var what = tx.type === 'transfer' ? 'โอนเงินแล้ว' : 'บันทึกรายการแล้ว';
    showToast(isOnline() ? what : 'บันทึกลงเครื่องแล้ว จะซิงก์ให้เมื่อมีเน็ต');
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

  var icon = state.newAssetIcon || '';
  var args = icon ? [name, group, icon] : [name, group];
  performWrite('addAsset', args, function () {
    var g = findGroupLocal(group);
    if (!g) {
      g = { name: group, includeInTotal: true, subtotal: 0, assets: [] };
      state.assetsOverview.groups.push(g);
    }
    var maxOrder = (g.assets || []).reduce(function (m, a) { return Math.max(m, a.order || 0); }, 0);
    g.assets.push({ name: name, group: group, balance: 0, order: maxOrder + 1, icon: icon, include: null });
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
      $('assetInitialBalance').value = '';
      state.newAssetIcon = '';
      closeModal('assetModal');
      showToast('เพิ่มสินทรัพย์แล้ว');
    });
}

function openEditBalanceModal(asset, group) {
  state.editingAssetName = asset.name;
  $('editBalanceTitle').textContent = 'จัดการ: ' + asset.name;
  $('editBalanceValue').value = asset.balance;
  $('editAssetName').value = asset.name;
  $('assetRenameNote').hidden = true;
  $('editAssetIconBtn').innerHTML = iconHtml(assetIcon(asset));
  renderAssetIncludeControl();
  populateGroupSelects(group ? group.name : asset.group);
  openModal('editBalanceModal');
}

/** สวิตช์ "นับใน เงินที่ใช้ได้" ของสินทรัพย์ที่กำลังแก้ */
function renderAssetIncludeControl() {
  var found = findAssetLocal(state.editingAssetName);
  if (!found) return;
  var counted = assetCounted(found.asset, found.group);
  $('editAssetInclude').checked = counted;
  var followsGroup = !(found.asset.include === true || found.asset.include === false);
  $('editAssetIncludeHint').textContent = followsGroup
    ? 'ตอนนี้ทำตามกลุ่ม "' + found.group.name + '" (' + (found.group.includeInTotal ? 'นับ' : 'ไม่นับ') + ')'
    : 'เลือกแยกจากกลุ่ม "' + found.group.name + '" (กลุ่ม' + (found.group.includeInTotal ? 'นับ' : 'ไม่นับ') + ')';
}

function setAssetIncludeHandler(checked) {
  var name = state.editingAssetName;
  var found = findAssetLocal(name);
  if (!found) return;
  // ถ้าตรงกับค่าของกลุ่ม ให้กลับไป "ทำตามกลุ่ม" — สวิตช์กลุ่มจะยังคุมตัวนี้ได้ในภายหลัง
  var value = (checked === !!found.group.includeInTotal) ? null : checked;
  performWrite('setAssetIncludeInTotal', [name, value], function () {
    var f = findAssetLocal(name);
    if (f) { f.asset.include = value; recomputeAssetTotals(); }
  }, 'ตั้งค่านับยอด ' + name).then(function () {
    renderAssetIncludeControl();
    showToast(checked ? 'นับ ' + name + ' ในเงินที่ใช้ได้แล้ว' : 'ไม่นับ ' + name + ' ในเงินที่ใช้ได้แล้ว');
  });
}

// ----- ตัวเลือกไอคอน (หน้าต่างแยก ใช้กับสินทรัพย์) -----

var iconPickerCallback = null;

function openIconPicker(title, current, library, onPick) {
  $('iconPickerTitle').textContent = title;
  renderIconChooser($('iconPickerModalBody'), library, current, function (ic) {
    closeModal('iconPickerModal');
    onPick(ic);
  });
  openModal('iconPickerModal');
}

function changeAssetIcon() {
  var name = state.editingAssetName;
  var found = findAssetLocal(name);
  if (!found) return;
  openIconPicker('ไอคอนของ ' + name, assetIcon(found.asset), ASSET_ICON_LIBRARY, function (ic) {
    $('editAssetIconBtn').innerHTML = iconHtml(ic);
    performWrite('setAssetIcon', [name, ic], function () {
      var f = findAssetLocal(name);
      if (f) f.asset.icon = ic;
    }, 'เปลี่ยนไอคอน ' + name).then(function () { showToast('เปลี่ยนไอคอนแล้ว'); });
  });
}

function renameAssetLocal(oldName, newName) {
  var found = findAssetLocal(oldName);
  if (found) found.asset.name = newName;
  Object.keys(state.months).forEach(function (k) {
    (state.months[k].days || []).forEach(function (d) {
      (d.items || []).forEach(function (it) {
        if (it.account === oldName) it.account = newName;
        if (it.toAccount === oldName) it.toAccount = newName;
      });
    });
  });
  var last = loadLastTx(), changed = false;
  ['account', 'transferFrom', 'transferTo'].forEach(function (k) { if (last[k] === oldName) { last[k] = newName; changed = true; } });
  if (changed) { try { localStorage.setItem(LAST_TX_KEY, JSON.stringify(last)); } catch (e) { /* ไม่เป็นไร */ } }
}

function saveEditBalance() {
  var val = parseFloat($('editBalanceValue').value);
  if (isNaN(val)) { showToast('กรุณาระบุตัวเลข'); return; }
  var oldName = state.editingAssetName;
  var newName = $('editAssetName').value.trim();
  if (!newName) { showToast('กรุณาใส่ชื่อสินทรัพย์'); return; }
  if (newName !== oldName && findAssetLocal(newName)) { showToast('มีสินทรัพย์ชื่อนี้อยู่แล้ว'); return; }
  var found = findAssetLocal(oldName);
  var balanceChanged = !found || Math.abs((Number(found.asset.balance) || 0) - val) > 0.001;

  var chain = Promise.resolve();
  if (newName !== oldName) {
    chain = performWrite('renameAsset', [oldName, newName], function () {
      renameAssetLocal(oldName, newName);
    }, 'เปลี่ยนชื่อ ' + oldName);
    state.editingAssetName = newName;
  }
  var name = newName;
  if (!balanceChanged) {
    chain.then(function () {
      closeModal('editBalanceModal');
      showToast(newName !== oldName ? 'เปลี่ยนชื่อแล้ว — รายการเก่าเปลี่ยนตามให้ด้วย' : 'ไม่มีอะไรเปลี่ยน');
    });
    return;
  }

  chain.then(function () {
    return performWrite('setAssetBalance', [name, val], function () {
      var f = findAssetLocal(name);
      if (f) { f.asset.balance = val; recomputeAssetTotals(); }
    }, 'ปรับยอด ' + name);
  }).then(function () {
    closeModal('editBalanceModal');
    showToast(newName !== oldName ? 'บันทึกชื่อและยอดแล้ว' : 'ปรับยอดแล้ว');
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
    var list = g.assets || [];
    var st = groupCountState(g);
    var n = list.filter(function (a) { return assetCounted(a, g); }).length;
    return '<div class="group-row" data-name="' + escapeHtml(g.name) + '">' +
      '<div class="group-order-btns">' +
      '  <button class="order-btn up"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
      '  <button class="order-btn down"' + (idx === groups.length - 1 ? ' disabled' : '') + '>▼</button>' +
      '</div>' +
      '<div class="group-name">' + escapeHtml(g.name) +
        (st === 'some' ? '<div class="group-sub">นับ ' + n + ' จาก ' + list.length + ' รายการ</div>' : '') + '</div>' +
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
        if (g) {
          g.includeInTotal = checked;
          // สวิตช์กลุ่ม = ตั้งทั้งกลุ่ม: ล้างค่าที่เคยเลือกแยกรายตัว (ตรงกับที่เซิร์ฟเวอร์ทำ)
          (g.assets || []).forEach(function (a) { a.include = null; });
          recomputeAssetTotals();
        }
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
  if (tab === 'more') state.morePage = null;   // แตะแท็บเพิ่มเติม = กลับมาที่เมนูเสมอ
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

  on('fabAdd', 'click', function () { openTxModal(null); });
  on('deleteTxBtn', 'click', function () {
    if (!txEdit) return;
    confirmDeleteTx(txEdit.item).then(function (done) {
      if (done) { txEdit = null; closeModal('txModal'); }
    });
  });
  on('closeModalBtn', 'click', function () { closeModal('txModal'); });
  on('saveTxBtn', 'click', saveTransaction);
  on('receiptInput', 'change', handleReceiptUpload);

  on('txTypeSegment', 'click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    setTxType(btn.dataset.type);
    if (!txEdit) applyLastAccounts(btn.dataset.type);
    renderTxPickers();
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
    state.newAssetIcon = '';
    $('newAssetIconBtn').textContent = '💰';
    openModal('assetModal');
  });
  on('newAssetIconBtn', 'click', function () {
    var guess = state.newAssetIcon || defaultAssetIcon({ name: $('assetName').value, group: $('assetGroupSelect').value });
    openIconPicker('เลือกไอคอนสินทรัพย์', guess, ASSET_ICON_LIBRARY, function (ic) {
      state.newAssetIcon = ic;
      $('newAssetIconBtn').innerHTML = iconHtml(ic);
    });
  });
  // ยังไม่ได้เลือกไอคอนเอง → แสดงไอคอนที่เดาจากชื่อ/กลุ่มให้เห็นก่อน
  ['assetName', 'assetGroupSelect'].forEach(function (id) {
    on(id, id === 'assetName' ? 'input' : 'change', function () {
      if (!state.newAssetIcon) {
        $('newAssetIconBtn').textContent = defaultAssetIcon({ name: $('assetName').value, group: $('assetGroupSelect').value });
      }
    });
  });
  on('editAssetIconBtn', 'click', changeAssetIcon);
  on('editAssetInclude', 'change', function (e) { setAssetIncludeHandler(e.target.checked); });
  on('closeIconPickerBtn', 'click', function () { closeModal('iconPickerModal'); });

  // เรียงลำดับหมวดหมู่
  document.querySelectorAll('[data-reorder]').forEach(function (btn) {
    btn.addEventListener('click', function () { openReorderModal(btn.dataset.reorder); });
  });
  document.querySelectorAll('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () { openMorePage(null); });
  });
  on('hapticsToggle', 'change', function (e) { setPref(HAPTICS_KEY, e.target.checked); if (e.target.checked) haptic(); });
  on('mascotToggle', 'change', function (e) { setPref(MASCOT_KEY, e.target.checked); applyMascot(); });
  if (window.MMT_ICONS && $('fabIcon')) $('fabIcon').innerHTML = window.MMT_ICONS.pencil;

  // หมูโผล่ที่ขอบบนของทุกหน้าต่าง: ย้ายเนื้อหาไปไว้ในกล่องที่เลื่อนได้ แล้ววางหมูไว้เหนือกล่อง
  // (ถ้าวางในกล่องที่เลื่อนได้ตรง ๆ หมูจะโดนตัดขอบ)
  document.querySelectorAll('.modal').forEach(function (m) {
    if (m.querySelector('.modal-scroll') || m.dataset.noWrap) return;
    var scroll = document.createElement('div');
    scroll.className = 'modal-scroll';
    while (m.firstChild) scroll.appendChild(m.firstChild);
    var pig = document.createElement('img');
    pig.className = 'modal-pig mascot mascot-tap';
    pig.src = 'img/pig-peek.png';
    pig.alt = '';
    m.appendChild(pig);
    m.appendChild(scroll);
  });
  // แตะหมู → หมูเด้ง
  document.addEventListener('click', function (e) {
    var pig = e.target.closest && e.target.closest('.mascot-tap');
    if (!pig) return;
    pig.classList.remove('boing'); void pig.offsetWidth; pig.classList.add('boing');
  });

  // เครื่องคิดเลข
  on('calcPad', 'click', function (e) {
    var b = e.target.closest('button[data-k]');
    if (b) calcPress(b.dataset.k);
  });
  on('txAmount', 'input', updateCalcPreview);
  on('txAccountBtn', 'click', function () { openAccountPicker('txAccount'); });
  on('fromAcctCard', 'click', function () { openAccountPicker('txAccount'); });
  on('toAcctCard', 'click', function () { openAccountPicker('txToAccount'); });
  on('closeAccountPickerBtn', 'click', function () { closeModal('accountPickerModal'); });
  on('saveTxTopBtn', 'click', saveTransaction);
  ['txAccount', 'txToAccount', 'txCategory'].forEach(function (id) { on(id, 'change', renderTxPickers); });
  on('editAssetName', 'input', function () {
    $('assetRenameNote').hidden = $('editAssetName').value.trim() === state.editingAssetName;
  });

  on('closeReorderModalBtn', 'click', function () { closeModal('reorderModal'); });
  on('saveReorderBtn', 'click', saveReorder);

  // ปฏิทินหน้าหลัก + ตัวเลือกวันที่ในฟอร์ม
  on('monthLabelBtn', 'click', function () {
    if (state.tab !== 'home') return;
    setHomeView(homeView() === 'calendar' ? 'list' : 'calendar');
  });
  on('clearDayFilterBtn', 'click', function () { state.selectedDay = null; renderHome(); });
  on('txDateBtn', 'click', toggleDatePicker);
  on('dpPrev', 'click', function () { shiftDatePicker(-1); });
  on('dpNext', 'click', function () { shiftDatePicker(1); });
  on('dpToday', 'click', function () { setTxDate(todayStr()); });
  on('dpYesterday', 'click', function () {
    var y = new Date(); y.setDate(y.getDate() - 1);
    setTxDate(dateKey(y.getFullYear(), y.getMonth(), y.getDate()));
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
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(ov.id); });
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
  setTxDate(todayStr());
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
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' })
      .then(function (reg) {
        // ตรวจหาเวอร์ชันใหม่หลังเปิดแอปสักครู่ และทุกครั้งที่สลับกลับมาที่แอป
        // (แอปบนหน้าจอโฮมของ iPhone มักเปิดต่อจากเดิม ไม่ได้โหลดหน้าใหม่ จึงต้องสั่งตรวจเอง)
        var check = function () { reg.update().catch(function () { /* ออฟไลน์ ไม่เป็นไร */ }); };
        setTimeout(check, 3000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
      })
      .catch(function (err) { console.warn('service worker registration failed', err); });
    // มีเวอร์ชันใหม่ติดตั้งเสร็จ → โหลดหน้าใหม่ 1 ครั้งให้เห็นของใหม่ทันที ไม่ต้องปิด-เปิดแอปเอง
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || window.__mmtReloaded) return;
      window.__mmtReloaded = true;
      location.reload();
    });
  });
}

window.addEventListener('DOMContentLoaded', init);
