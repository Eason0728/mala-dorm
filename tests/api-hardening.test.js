// node ~/mala-dorm-contract/tests/api-hardening.test.js
// 用假的 SpreadsheetApp／Utilities 驗證：已簽不回個資、30 天到期、sign_png 檢查、管理端 list 不受影響
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, '..', 'apps-script');
const pad = n => String(n).padStart(2, '0');
const tpe = d => { const t = new Date(d.getTime() + 8 * 3600e3); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth()+1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`; };
const daysAgo = n => tpe(new Date(Date.now() - n * 86400e3));

const rows = [
  { contract_id: 'C1', token: 'tok_signed', name: '王', id_no: 'A123456789', phone: '0912345678', mail_addr: '新竹', room: '二樓單人房', bed: '', room_type: '單人房', rent: 3500, term_start: '2026-08-01', term_end: '2027-01-31', status: '在住', signed_at: '2026-08-02 10:00:00', pdf_id: 'PDF1', created_at: daysAgo(90) },
  { contract_id: 'C2', token: 'tok_fresh', name: '李', room: '二樓單人房', bed: '', room_type: '單人房', rent: 3500, term_start: '2026-10-01', term_end: '2027-03-31', status: '待簽', created_at: daysAgo(29) },
  { contract_id: 'C3', token: 'tok_old', name: '張', room: '二樓單人房', bed: '', room_type: '單人房', rent: 3500, term_start: '2026-08-01', term_end: '2027-01-31', status: '待簽', created_at: daysAgo(31) },
  { contract_id: 'C4', token: 'tok_nodate', name: '趙', room: '二樓單人房', bed: '', room_type: '單人房', rent: 3500, term_start: '2026-08-01', term_end: '2027-01-31', status: '待簽', created_at: '' },
  { contract_id: 'C5', token: 'tok_dateobj', name: '錢', room: '二樓單人房', bed: '', room_type: '單人房', rent: 3500, term_start: '2026-08-01', term_end: '2027-01-31', status: '待簽', created_at: new Date(Date.now() - 40 * 86400e3) },
];
const hrows = [
  { handover_id: 'H1', contract_id: 'C1', token: 'h_signed', signed_at: '2026-09-01 10:00:00', items_json: '[{"item":"書桌"}]', compensation_total: 500, pdf_id: 'HPDF', created_at: daysAgo(90) },
  { handover_id: 'H2', contract_id: 'C1', token: 'h_fresh', signed_at: '', created_at: daysAgo(29) },
  { handover_id: 'H3', contract_id: 'C1', token: 'h_old', signed_at: '', created_at: daysAgo(31) },
];
const updates = [];
const ctx = {
  console, Logger: { log() {} }, ROOMS: [], EQUIP_ITEMS: ['書桌'], TERMS_VERSION: 'v',
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { base64Decode: b => Array.from(Buffer.from(b, 'base64')).map(x => x > 127 ? x - 256 : x), newBlob: () => ({}) },  // 模擬 GAS：回傳有號位元組
  DriveApp: { getFolderById: () => ({ createFile: () => ({ getId: () => 'F' }) }) },
  readSheet: n => n === 'contracts' ? rows.map(r => Object.assign({ _row: 2 }, r)) : n === 'handovers' ? hrows.map(r => Object.assign({ _row: 2 }, r)) : [],
  getSettings: () => ({ 'admin.pass': 'pw', 'drive.folder_id': 'x', 'collect.ip': 'FALSE' }),
  logAudit() {}, fmtDate: d => String(d || '').slice(0, 10), fmtDateTime: d => String(d || ''),
  roomBedDisplay: r => r.room, renderTerms: () => ({ clauses: ['含個資條文'] }),
  updateRow: (...a) => updates.push(a), nowStr: () => 'now', buildContractPdf: () => 'url',
};
vm.createContext(ctx);
['Api.gs', 'Sign.gs', 'Handover.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
const get = t => ctx.getContractByToken(t, {});
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };

ok('1 已簽：只回 state/簽署日/非個資，無 id_no phone mail_addr terms', () => {
  const r = get('tok_signed');
  assert.strictEqual(r.state, 'signed'); assert.strictEqual(r.contract.signed_at, '2026-08-02 10:00:00');
  const j = JSON.stringify(r);
  ['A123456789', '0912345678', '新竹', 'id_no', 'phone', 'mail_addr', 'terms', 'PDF1'].forEach(k => assert(!j.includes(k), '洩漏 ' + k));
});
ok('1b 已簽且 created_at 超過 30 天仍回已簽（不被到期擋）', () => assert.strictEqual(get('tok_signed').state, 'signed'));
ok('2 未簽 29 天：正常 pending 且仍含完整合約資料', () => { const r = get('tok_fresh'); assert.strictEqual(r.ok, true); assert.strictEqual(r.state, 'pending'); assert(r.terms && r.contract.name === '李'); });
ok('2 未簽 31 天：過期', () => { const r = get('tok_old'); assert.strictEqual(r.ok, false); assert.strictEqual(r.state, 'expired'); assert.strictEqual(r.error, '連結已過期，請洽管理員重發'); });
ok('2 created_at 為 Date 物件 40 天：過期', () => assert.strictEqual(get('tok_dateobj').state, 'expired'));
ok('2 created_at 空白：不擋（維持舊行為）', () => assert.strictEqual(get('tok_nodate').state, 'pending'));
ok('2 邊界：30 天整內不過期、超過過期', () => {
  assert.strictEqual(ctx.isLinkExpired_({ created_at: daysAgo(29.9) }), false);
  assert.strictEqual(ctx.isLinkExpired_({ created_at: daysAgo(30.1) }), true);
});
ok('3 管理端 list 不受影響（仍含 token、status、signed_at）', () => {
  const l = ctx.listContracts(); assert.strictEqual(l.length, 5);
  assert(l[0].token === 'tok_signed' && l[0].status === '在住' && l[0].signed_at);
  assert(JSON.parse(ctx.doGet({ parameter: { action: 'list', pass: 'pw' } }).s).ok);
  assert(!JSON.parse(ctx.doGet({ parameter: { action: 'list', pass: 'bad' } }).s).ok);
});
const PNG_HEAD = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0,0,0,0x0D]);
const good = 'data:image/png;base64,' + Buffer.concat([PNG_HEAD, Buffer.alloc(900)]).toString('base64');
const pre = 'data:image/png;base64,', headB64 = PNG_HEAD.toString('base64');
const withLen = n => pre + headB64 + 'A'.repeat(n - pre.length - headB64.length);
ok('5 sign_png 檢查', () => {
  assert.strictEqual(ctx.checkSignPng_(good), '');
  assert.notStrictEqual(ctx.checkSignPng_('data:image/jpeg;base64,AAAA'), '');
  assert.notStrictEqual(ctx.checkSignPng_('AAAA'), '');
  assert.notStrictEqual(ctx.checkSignPng_('data:image/png;base64,<script>'), '');
  assert.notStrictEqual(ctx.checkSignPng_(withLen(500 * 1024 + 1)), '');
  assert.strictEqual(ctx.checkSignPng_(withLen(500 * 1024)), '');
});
ok('5b PNG 檔頭：JPEG/GIF/純文字/過短即使標成 png 也擋', () => {
  const jpg = Buffer.from([0xFF,0xD8,0xFF,0xE0,0,0x10,0x4A,0x46,0x49,0x46,0,1]).toString('base64');
  const gif = Buffer.from('GIF89a' + 'xxxxxxxxxx').toString('base64');
  assert.notStrictEqual(ctx.checkSignPng_(pre + jpg), '');
  assert.notStrictEqual(ctx.checkSignPng_(pre + gif), '');
  assert.notStrictEqual(ctx.checkSignPng_(pre + 'A'.repeat(1000)), '');
  assert.notStrictEqual(ctx.checkSignPng_(pre + 'iVBORw0K'), '');  // 過短
  const off = Buffer.from(PNG_HEAD); off[7] = 0x0B;  // 最後一個檔頭 byte 錯
  assert.notStrictEqual(ctx.checkSignPng_(pre + off.toString('base64')), '');
});
const sign = (tok, png) => { try { return ctx.submitSign({ token: tok, sign_png: png, id_no: 'a123456789', phone: '0912345678', equip: [{ ok: true }] }, {}); } catch (e) { return { err: e.message }; } };
ok('5 submitSign：壞格式/過大被擋、正常通過、過期被擋', () => {
  assert.strictEqual(sign('tok_fresh', 'data:image/jpeg;base64,AA').err, '簽名格式不正確');
  assert.strictEqual(sign('tok_fresh', 'data:image/png;base64,' + 'A'.repeat(600 * 1024)).err, '簽名圖檔過大');
  assert.strictEqual(sign('tok_fresh', good).ok, true);
  assert.strictEqual(sign('tok_old', good).state, 'expired');
  assert.strictEqual(sign('tok_signed', good).state, 'signed');
});
const hget = t => ctx.getHandoverByToken(t, {});
ok('6 點交已簽：只回 state/簽署日，無姓名房床品項賠償 PDF', () => {
  const r = hget('h_signed'); assert.strictEqual(r.state, 'signed'); assert.strictEqual(r.handover.signed_at, '2026-09-01 10:00:00');
  const j = JSON.stringify(r);
  ['王', '二樓單人房', '書桌', 'compensation', '500', 'HPDF', 'pdf', 'items', 'contract_id', 'equip'].forEach(k => assert(!j.includes(k), '洩漏 ' + k));
});
ok('6 點交 29 天 pending、31 天 expired', () => {
  assert.strictEqual(hget('h_fresh').state, 'pending');
  const r = hget('h_old'); assert.strictEqual(r.ok, false); assert.strictEqual(r.state, 'expired'); assert.strictEqual(r.error, '連結已過期，請洽管理員重發');
});
const hsign = (tok, png) => { try { return ctx.submitHandover({ token: tok, sign_png: png, items: [{ item: '書桌', normal: true, returned: true }] }, {}); } catch (e) { return { err: e.message }; } };
ok('6 submitHandover：過期擋、壞簽名擋、已簽擋', () => {
  assert.strictEqual(hsign('h_old', good).state, 'expired');
  assert.strictEqual(hsign('h_fresh', 'data:image/png;base64,' + 'A'.repeat(1000)).err, '簽名格式不正確');
  assert.strictEqual(hsign('h_fresh', 'data:image/jpeg;base64,AA').err, '簽名格式不正確');
  assert.strictEqual(hsign('h_signed', good).state, 'signed');
});
ok('4 合約已簽回應不含 contract_id／租期，保留姓名房床', () => {
  const c = get('tok_signed').contract; assert.deepStrictEqual(Object.keys(c).sort(), ['name', 'room_bed', 'signed_at']);
});
console.log(`\n${n} groups passed`);
