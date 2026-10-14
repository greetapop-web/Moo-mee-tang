/**
 * icons.js — ไอคอนภาพวาดของหมูมีตัง (สไตล์การ์ตูนพาสเทล เส้นขอบม่วงเข้ม)
 * วาดเป็น SVG ในไฟล์นี้เอง จึงคมชัดทุกขนาดและใช้ได้ตอนออฟไลน์
 */
(function () {
  var O = 'stroke="#4b3d6b" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"';
  function svg(body) { return '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">' + body + '</svg>'; }
  function dots(x, y, n, gap) { var s = ''; for (var i = 0; i < n; i++) s += '<circle cx="' + (x + i * gap) + '" cy="' + y + '" r="1.1" fill="#4b3d6b"/>'; return s; }

  window.MMT_ICONS = {
    // หมวดหมู่: ลิ้นชักเก็บของ
    categories: svg(
      '<path d="M10 30 L16 16 H48 L54 30 Z" fill="#c9cde6" ' + O + '/>' +
      '<path d="M22 22 H42 M20 26 H44" ' + O + ' fill="none"/>' +
      '<rect x="10" y="30" width="44" height="18" rx="3" fill="#e9a3b4" ' + O + '/>' +
      '<path d="M24 30 Q32 38 40 30" fill="#f6d6de" ' + O + '/>' + dots(15, 43, 9, 4.2)),
    // บัญชี: บัตรสีฟ้า
    accounts: svg(
      '<rect x="8" y="16" width="48" height="32" rx="4" fill="#8ec5ef" ' + O + '/>' +
      '<rect x="8" y="22" width="48" height="6" fill="#6b7a99" stroke="#4b3d6b" stroke-width="2.4"/>' +
      '<path d="M14 36 H28 M14 41 H22" ' + O + ' fill="none" stroke="#ffffff"/>' +
      '<circle cx="44" cy="39" r="4" fill="#f4a3b5" ' + O + '/><circle cx="49" cy="39" r="4" fill="#f7d36b" ' + O + '/>'),
    // โอนเงิน: ลูกศรสองทาง + เหรียญ
    transfer: svg(
      '<circle cx="32" cy="32" r="22" fill="#d7f0dc" ' + O + '/>' +
      '<path d="M20 26 H42 L36 20" fill="none" ' + O + ' stroke="#2f9e5b"/>' +
      '<path d="M44 38 H22 L28 44" fill="none" ' + O + ' stroke="#e2557d"/>' +
      '<circle cx="32" cy="32" r="5" fill="#f7d36b" ' + O + '/>'),
    // จัดการกลุ่ม: กระเป๋าซ้อนชั้น
    groups: svg(
      '<rect x="12" y="14" width="40" height="10" rx="3" fill="#f4a3b5" ' + O + '/>' +
      '<rect x="10" y="22" width="44" height="10" rx="3" fill="#f7d36b" ' + O + '/>' +
      '<rect x="8" y="30" width="48" height="22" rx="4" fill="#9fd9b0" ' + O + '/>' +
      '<path d="M40 38 H56 V46 H40 A4 4 0 0 1 40 38 Z" fill="#c9cde6" ' + O + '/>' +
      '<circle cx="42" cy="42" r="1.6" fill="#4b3d6b"/>'),
    // วิเคราะห์: กราฟวงกลม
    analysis: svg(
      '<circle cx="32" cy="32" r="21" fill="#8ec5ef" ' + O + '/>' +
      '<path d="M32 32 V11 A21 21 0 0 1 52.6 36 Z" fill="#f4a3b5" ' + O + '/>' +
      '<path d="M32 32 L52.6 36 A21 21 0 0 1 36 52.6 Z" fill="#f7d36b" ' + O + '/>' +
      '<circle cx="32" cy="32" r="8" fill="#fff8ec" ' + O + '/>'),
    // ธีมสี: จานสี
    theme: svg(
      '<path d="M32 10 C16 10 8 22 10 34 C12 46 24 54 34 52 C40 51 38 44 42 42 C48 40 56 42 56 32 C56 18 46 10 32 10 Z" fill="#fff1d6" ' + O + '/>' +
      '<circle cx="22" cy="24" r="4.5" fill="#e2557d" ' + O + '/><circle cx="34" cy="19" r="4.5" fill="#f7d36b" ' + O + '/>' +
      '<circle cx="46" cy="25" r="4.5" fill="#2f9e5b" ' + O + '/><circle cx="20" cy="37" r="4.5" fill="#6aa8e8" ' + O + '/>' +
      '<circle cx="30" cy="44" r="3" fill="#c9cde6" ' + O + '/>'),
    // การตั้งค่า: เฟือง
    settings: svg(
      '<path d="M28 8 H36 L37.5 15 L43 17.5 L49 13.5 L54.5 19 L50.5 25 L53 30.5 L60 32 V36 L53 37.5 L50.5 43 L54.5 49 L49 54.5 L43 50.5 L37.5 53 L36 60 H28 L26.5 53 L21 50.5 L15 54.5 L9.5 49 L13.5 43 L11 37.5 L4 36 V32 L11 30.5 L13.5 25 L9.5 19 L15 13.5 L21 17.5 L26.5 15 Z" ' +
        'transform="translate(0 -2) scale(1 1)" fill="#c9cde6" ' + O + '/>' +
      '<circle cx="32" cy="32" r="11" fill="#9aa3cf" ' + O + '/><circle cx="32" cy="32" r="5" fill="#f7d36b" ' + O + '/>'),
    // ซิงก์: เมฆ + ลูกศรวน
    sync: svg(
      '<path d="M18 46 A10 10 0 0 1 17 26 A14 14 0 0 1 44 22 A11 11 0 0 1 47 46 Z" fill="#cfe6fb" ' + O + '/>' +
      '<path d="M25 36 A8 8 0 0 1 39 32" fill="none" ' + O + ' stroke="#2f9e5b"/><path d="M39 27 V32 H34" fill="none" ' + O + ' stroke="#2f9e5b"/>' +
      '<path d="M39 38 A8 8 0 0 1 25 42" fill="none" ' + O + ' stroke="#e2557d"/><path d="M25 47 V42 H30" fill="none" ' + O + ' stroke="#e2557d"/>'),
    // เกี่ยวกับ: ฟองคำพูด i
    about: svg(
      '<path d="M32 10 C17 10 8 19 8 30 C8 38 13 44 20 47 L16 56 L28 49 C29 49 31 50 32 50 C47 50 56 41 56 30 C56 19 47 10 32 10 Z" fill="#f7d36b" ' + O + '/>' +
      '<ellipse cx="32" cy="30" rx="18" ry="14" fill="#8ec5ef" ' + O + '/>' +
      '<circle cx="32" cy="22.5" r="2.4" fill="#ffffff" ' + O + '/><path d="M32 28 V39" ' + O + ' stroke="#ffffff" stroke-width="4"/>'),
    // ดินสอ (ปุ่มจดบันทึก)
    pencil: svg(
      '<g transform="rotate(45 32 32)">' +
      '<rect x="25" y="4" width="14" height="9" rx="3" fill="#f4a3b5" ' + O + '/>' +
      '<rect x="25" y="13" width="14" height="4" fill="#c9cde6" ' + O + '/>' +
      '<rect x="25" y="17" width="14" height="27" fill="#f7d36b" ' + O + '/>' +
      '<path d="M32 17 V44" ' + O + ' stroke="#e0a92c" stroke-width="1.6"/>' +
      '<path d="M25 44 L32 58 L39 44 Z" fill="#f6d7b0" ' + O + '/>' +
      '<path d="M29.5 53 L32 58 L34.5 53 Z" fill="#4b3d6b"/></g>')
  };
})();
