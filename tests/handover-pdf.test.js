// node ~/mala-dorm-contract/tests/handover-pdf.test.js
// 2026-10-26 handoverPdf（管理系統現場把點交 PDF 交給同仁）：要通行碼、只給已簽且有 PDF 的點交單、不改資料
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, '..', 'apps-script');
const hrows = [
  { handover_id: 'H1', contract_id: 'C1', token: 'h_signed', signed_at: '2026-09-01 10:00:00', pdf_id: 'HPDF', created_at: '2026-01-01 00:00:00' },
  { handover_id: 'H2', contract_id: 'C1', token: 'h_pending', signed_at: '', pdf_id: '', created_at: '2026-10-20 00:00:00' },
  { handover_id: 'H3', contract_id: 'C1', token: 'h_nopdf', signed_at: '2026-09-01 10:00:00', pdf_id: '', created_at: '2026-10-20 00:00:00' },
  { handover_id: 'H4', contract_id: 'C1', token: 'h_big', signed_at: '2026-09-01 10:00:00', pdf_id: 'BIG', created_at: '2026-10-20 00:00:00' },
];
const PDF = Buffer.from('%PDF-1.4 fake');
const updates = [], audits = [];
const ctx = {
  console, Logger: { log() {} }, ROOMS: [], EQUIP_ITEMS: ['書桌'], TERMS_VERSION: 'v',
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { base64Encode: b => Buffer.from(b.map(x => x & 255)).toString('base64') },
  DriveApp: { getFileById: id => ({
    getName: () => '2026-09-01_王_設備點交.pdf',
    getBlob: () => ({ getBytes: () => id === 'BIG' ? new Array(8 * 1024 * 1024 + 1).fill(0) : Array.from(PDF) })
  }) },
  readSheet: n => n === 'handovers' ? hrows.map(r => Object.assign({ _row: 2 }, r)) : [],
  getSettings: () => ({ 'admin.pass': 'pw' }),
  logAudit: (...a) => audits.push(a), updateRow: (...a) => updates.push(a), appendRow: (...a) => updates.push(a),
};
vm.createContext(ctx);
['Api.gs', 'Handover.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
const post = body => JSON.parse(ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(body) } }).s);
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };

ok('1 通行碼錯或沒帶：擋', () => {
  assert.strictEqual(post({ action: 'handoverPdf', token: 'h_signed', pass: 'bad' }).ok, false);
  assert.strictEqual(post({ action: 'handoverPdf', token: 'h_signed' }).ok, false);
});
ok('2 已簽有 PDF：回檔名、mime、base64 內容正確', () => {
  const r = post({ action: 'handoverPdf', token: 'h_signed', pass: 'pw' });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.mime, 'application/pdf');
  assert.strictEqual(r.name, '2026-09-01_王_設備點交.pdf');
  assert.strictEqual(Buffer.from(r.pdf_b64, 'base64').toString(), '%PDF-1.4 fake');
});
ok('3 未簽／沒有 PDF／token 不存在／缺 token：不給檔', () => {
  for (const t of ['h_pending', 'h_nopdf', 'nope', '']) {
    const r = post({ action: 'handoverPdf', token: t, pass: 'pw' });
    assert.strictEqual(r.ok, false); assert(!r.pdf_b64);
  }
});
ok('4 超過 8MB：不回內容', () => { const r = post({ action: 'handoverPdf', token: 'h_big', pass: 'pw' }); assert.strictEqual(r.ok, false); assert(!r.pdf_b64); });
ok('5 不寫任何分頁、只記稽核', () => {
  assert.strictEqual(updates.length, 0);
  assert(audits.length >= 1 && audits.every(a => a[0] === 'handover_pdf_download'));
});
ok('6 doGet 沒有開這個入口（GET 會讓通行碼進網址）', () => {
  assert.strictEqual(JSON.parse(ctx.doGet({ parameter: { action: 'handoverPdf', token: 'h_signed', pass: 'pw' } }).s).ok, false);
});
console.log(`全部 ${n} 項通過`);
