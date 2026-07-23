/**
 * TASK-02　後端骨架：試算表存取、token、編號、設定、稽核
 */

/** 房間清單（共用契約：房間值與床位值一字不差） */
const ROOMS = [
  { room: '二樓單人房', beds: [], type: '單人房' },
  { room: '二樓四人房', beds: ['1號床位', '2號床位', '3號床位', '4號床位'], type: '四人房' },
  { room: '三樓單人房', beds: [], type: '單人房' },
  { room: '三樓1號房', beds: ['雙人床位A', '雙人床位B'], type: '雙人房' },
  { room: '三樓2號房', beds: [], type: '單人房' },
  { room: '三樓3號房', beds: ['雙人床位A', '雙人床位B'], type: '雙人房' },
];

const EQUIP_ITEMS = ['書桌', '椅子', '床架', '床墊', '衣櫃', '房間鑰匙', '大門遙控器'];

const TZ = 'Asia/Taipei';

function getSS() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SS_ID);
  if (!id) throw new Error('尚未建立試算表，請先執行 setupCreateSpreadsheet()');
  return SpreadsheetApp.openById(id);
}

function getSheet(name) {
  const sh = getSS().getSheetByName(name);
  if (!sh) throw new Error('找不到工作表：' + name);
  return sh;
}

/** 讀整張表成物件陣列（第一列為欄名） */
function readSheet(name) {
  const sh = getSheet(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(function (row, i) {
    const o = { _row: i + 2 };
    headers.forEach(function (h, c) { o[h] = row[c]; });
    return o;
  });
}

/** 依欄名附加一列 */
function appendRow(name, obj) {
  const sh = getSheet(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sh.appendRow(row);
  return sh.getLastRow();
}

/** 更新某一列的部分欄位 */
function updateRow(name, rowIndex, patch) {
  const sh = getSheet(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(patch).forEach(function (k) {
    const c = headers.indexOf(k);
    if (c >= 0) sh.getRange(rowIndex, c + 1).setValue(patch[k]);
  });
}

/** 設定值（快取在同一次執行內） */
let _settingsCache = null;
function getSettings() {
  if (_settingsCache) return _settingsCache;
  const rows = readSheet('settings');
  const o = {};
  rows.forEach(function (r) { if (r.key) o[r.key] = r.value; });
  _settingsCache = o;
  return o;
}

function setSetting(key, value) {
  const sh = getSheet('settings');
  const rows = readSheet('settings');
  const hit = rows.filter(function (r) { return r.key === key; })[0];
  if (hit) sh.getRange(hit._row, 2).setValue(value);
  else sh.appendRow([key, value, '']);
  _settingsCache = null;
}

/** 32 字元小寫十六進位 token */
function genToken() {
  return (Utilities.getUuid() + Utilities.getUuid())
    .replace(/-/g, '').toLowerCase().slice(0, 32);
}

/** 編號：C-YYYYMMDD-NNN／H-YYYYMMDD-NNN */
function nextId(prefix, sheetName, idField) {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd');
  const head = prefix + '-' + today + '-';
  const rows = readSheet(sheetName);
  let max = 0;
  rows.forEach(function (r) {
    const v = String(r[idField] || '');
    if (v.indexOf(head) === 0) {
      const n = parseInt(v.slice(head.length), 10);
      if (n > max) max = n;
    }
  });
  return head + ('00' + (max + 1)).slice(-3);
}

function nowStr() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function fmtDate(d) {
  if (!d) return '';
  return Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd');
}

function fmtDateTime(d) {
  if (!d) return '';
  return Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd HH:mm:ss');
}

/** 民國式日期，PDF 用 */
function fmtRoc(d) {
  const dt = new Date(d);
  return '民國' + (dt.getFullYear() - 1911) + '年' + (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
}

/** 租期迄日：起日 + n 個月 − 1 天 */
function addMonthsMinusDay(start, months) {
  const d = new Date(start);
  d.setMonth(d.getMonth() + Number(months));
  d.setDate(d.getDate() - 1);
  return d;
}

/** 稽核紀錄，只增不改 */
function logAudit(event, refId, e, detail) {
  const ip = (e && e.parameter && e.parameter._ip) || '';
  let ua = '';
  try { ua = (e && e.parameter && e.parameter._ua) || ''; } catch (err) { ua = ''; }
  appendRow('audit_log', {
    ts: nowStr(), event: event, ref_id: refId || '',
    ip: ip, ua: ua, detail: detail || '',
  });
}

/** 房間 → 房型 → 月租金 */
function roomTypeOf(room) {
  const hit = ROOMS.filter(function (r) { return r.room === room; })[0];
  if (!hit) throw new Error('未知房間：' + room);
  return hit.type;
}

function rentOf(room, occupancy) {
  const s = getSettings();
  // 單人房合租（Eason 2026-07-24）：兩人分租一間單人房，每人 1,750
  if (roomTypeOf(room) === '單人房' && occupancy === '合租') {
    return Number(s['rate.單人房合租'] || 1750);
  }
  const rate = s['rate.' + roomTypeOf(room)];
  if (rate === undefined || rate === '') throw new Error('settings 缺少 rate.' + roomTypeOf(room));
  return Number(rate);
}

/** 房間＋床位的顯示字串（合租加註記） */
function roomBedDisplay(c) {
  let t = (c.room + ' ' + (c.bed || '')).trim();
  if (String(c.room_type) === '單人房合租') t += '（合租）';
  return t;
}

/** 占用檢查。回傳 null＝可建；否則回警告文字 */
function occupancyConflict(room, bed, occupancy) {
  const active = readSheet('contracts').filter(function (r) {
    return r.room === room && (r.status === '待簽' || r.status === '在住');
  });
  const def = ROOMS.filter(function (r) { return r.room === room; })[0];
  if (def.beds.length > 0) {
    // 多床房：同床位不得重複
    const hit = active.filter(function (r) { return String(r.bed || '') === String(bed || ''); });
    return hit.length ? (room + ' ' + bed + ' 目前已有待簽或在住的合約。') : null;
  }
  // 單人房：自住要全空；合租擋自住、上限兩份
  const solo = active.filter(function (r) { return String(r.room_type) !== '單人房合租'; });
  const shared = active.filter(function (r) { return String(r.room_type) === '單人房合租'; });
  if (occupancy === '合租') {
    if (solo.length) return room + ' 目前有自住合約，無法建立合租。';
    if (shared.length >= 2) return room + ' 合租已滿（2 人）。';
    return null;
  }
  if (active.length) return room + ' 目前已有' + (shared.length ? '合租' : '') + '合約，無法建立自住。';
  return null;
}
