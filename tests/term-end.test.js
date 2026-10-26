// node tests/term-end.test.js —— 租期迄日 addMonthsMinusDay（2026-10-26 Eason：8/31 起租六個月 → 2/28）
// 用真的 Core.gs，Utilities.formatDate 以 Intl 照指定時區模擬；在任何執行環境時區都要得到同一個答案
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Core.gs'), 'utf8');
const formatDate = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const ctx = { Utilities: { formatDate: (d, tz, fmt) => { if (fmt !== 'yyyy-MM-dd') throw new Error('測試只模擬 yyyy-MM-dd'); return formatDate(d, tz); } }, console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const end = (s, n = 6) => formatDate(ctx.addMonthsMinusDay(new Date(s), n), 'Asia/Taipei');

const cases = [
  ['2026-08-31', '2027-02-28', '★8/31 起租 → 隔年 2/28（原本溢位成 3/2）'],
  ['2027-08-31', '2028-02-29', '閏年 → 2/29'],
  ['2026-08-30', '2027-02-28', '8/30 → 2/28'],
  ['2026-08-29', '2027-02-28', '8/29 → 2/28（2027 沒有 2/29）'],
  ['2026-08-28', '2027-02-27', '8/28 → 2/27（不變）'],
  ['2026-08-01', '2027-01-31', '8/1 → 1/31（不變，與 Api.gs testPhase1 同一組）'],
  ['2026-01-31', '2026-07-30', '1/31 → 7/30（不變，7 月有 31 日）'],
  ['2026-03-31', '2026-09-30', '★3/31 → 9/30（原本 10/1）'],
  ['2026-12-15', '2027-06-14', '跨年'],
];
let n = 0;
for (const [s, want, label] of cases) { assert.strictEqual(end(s), want, label + '：實際 ' + end(s)); n++; console.log('PASS: ' + label); }
assert.strictEqual(end('2026-08-31', 12), '2027-08-30', '12 個月：8/31 → 隔年 8/30'); n++;
// 起日是試算表讀回的 Date（台北午夜＝前一天 16:00 UTC）也要算同一天
assert.strictEqual(formatDate(ctx.addMonthsMinusDay(new Date('2026-08-30T16:00:00Z'), 6), 'Asia/Taipei'), '2027-02-28', '起日是台北午夜的 Date'); n++;
console.log('全部通過，共 ' + n + ' 項（TZ=' + (process.env.TZ || '系統') + '）');
