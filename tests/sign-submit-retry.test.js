// tests/sign-submit-retry.test.js —— sign.html 送出失敗後按鈕必須恢復可按
// 跑法：node tests/sign-submit-retry.test.js
// 從 sign.html 抽出真正的 submit() 原始碼，在假的 document／fetch 下執行（不打網路）。
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'sign.html'), 'utf8');
const m = /async function submit\(data\) \{[\s\S]*?\n\}\n/.exec(html);
assert.ok(m, '找不到 submit()');

async function run(fetchImpl) {
  const btn = { disabled: false, textContent: '確認送出' };
  const alerts = [];
  let done = null;
  const els = { submit: btn, f_id_no: { value: 'a123456789' }, f_phone: { value: '0912345678' }, f_mail_addr: { value: 'x' } };
  const sandbox = {
    document: { getElementById: (id) => els[id] },
    qs: new URLSearchParams('t=TOK'), equipBoxes: [], pad: { dataUrl: () => 'data:image/png;base64,AA' },
    navigator: { userAgent: 'UA' }, MOCK: false, API_URL: 'https://example.test/exec',
    fetch: fetchImpl, alert: (x) => alerts.push(x), showDone: (msg, url) => { done = [msg, url]; },
    JSON, String, Promise, setTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(m[0] + '\nthis.submit = submit;', sandbox);
  await sandbox.submit();
  return { btn, alerts, done };
}

(async () => {
  let r = await run(async () => { throw new TypeError('Failed to fetch'); });
  assert.deepEqual(r.alerts, ['連線失敗，請檢查網路後再按一次送出']);
  assert.equal(r.btn.disabled, false); assert.equal(r.btn.textContent, '確認送出'); assert.equal(r.done, null);
  console.log('ok 網路錯誤 → 提示連線失敗、按鈕恢復');

  r = await run(async () => ({ json: async () => { throw new SyntaxError('not json'); } }));
  assert.deepEqual(r.alerts, ['連線失敗，請檢查網路後再按一次送出']);
  assert.equal(r.btn.disabled, false); assert.equal(r.btn.textContent, '確認送出');
  console.log('ok 回應不是 JSON → 提示連線失敗、按鈕恢復');

  r = await run(async () => ({ json: async () => ({ ok: false, error: 'E' }) }));
  assert.deepEqual(r.alerts, ['送出失敗：E']);
  assert.equal(r.btn.disabled, false); assert.equal(r.btn.textContent, '確認送出');
  console.log('ok 後端 ok:false → 原提示、按鈕恢復');

  r = await run(async () => ({ json: async () => ({ ok: true, pdf_url: 'https://drive.google.com/x' }) }));
  assert.deepEqual(r.done, ['簽署完成', 'https://drive.google.com/x']); assert.deepEqual(r.alerts, []);
  console.log('ok 成功流程不變');
})().catch((e) => { console.error(e); process.exit(1); });
