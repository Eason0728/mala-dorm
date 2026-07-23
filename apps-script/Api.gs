/**
 * TASK-03　建合約單 API：create / list（管理端用）
 * 前端呼叫的入口都走 doGet / doPost。
 */

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function requireAdmin(p) {
  const s = getSettings();
  const pass = String(s['admin.pass'] || '');
  if (!pass) throw new Error('尚未設定管理端通行碼，請先執行 setupAdminPass()');
  if (String(p.pass || '') !== pass) {
    const err = new Error('通行碼錯誤');
    err.code = 401;
    throw err;
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'rooms':
        return jsonOut({ ok: true, rooms: ROOMS, equip: EQUIP_ITEMS });
      case 'list':
        requireAdmin(p);
        return jsonOut({ ok: true, contracts: listContracts() });
      case 'contract':
        return jsonOut(getContractByToken(p.token, e));
      case 'handover':
        return jsonOut(getHandoverByToken(p.token, e));
      default:
        return jsonOut({ ok: false, error: '未知的 action：' + p.action });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message, code: err.code || 500 });
  }
}

function doPost(e) {
  const p = Object.assign({}, (e && e.parameter) || {});
  try {
    if (e && e.postData && e.postData.contents) {
      Object.assign(p, JSON.parse(e.postData.contents));
    }
  } catch (err) { /* 非 JSON body 就沿用 parameter */ }

  try {
    switch (p.action) {
      case 'create':
        requireAdmin(p);
        return jsonOut(createContract(p, e));
      case 'sign':
        return jsonOut(submitSign(p, e));
      case 'handoverCreate':
        return jsonOut(createHandover(p, e));
      case 'handoverSign':
        return jsonOut(submitHandover(p, e));
      case 'terminate':
        return jsonOut(markTerminate(p, e));
      case 'cleanupTest':
        requireAdmin(p);
        cleanupE2E();
        return jsonOut({ ok: true });
      default:
        return jsonOut({ ok: false, error: '未知的 action：' + p.action });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message, code: err.code || 500 });
  }
}

/**
 * 建立合約單
 * 必填：name, id_no, phone, mail_addr, room, term_start, deposit_type
 * 選填：bed, deposit_amt, fee_mgmt, fee_water, fee_power, force
 */
function createContract(p, e) {
  ['name', 'room', 'term_start'].forEach(function (k) {
    if (!p[k]) throw new Error('缺少必填欄位：' + k);
  });

  const roomDef = ROOMS.filter(function (r) { return r.room === p.room; })[0];
  if (!roomDef) throw new Error('未知房間：' + p.room);
  const bed = String(p.bed || '');
  if (roomDef.beds.length > 0 && roomDef.beds.indexOf(bed) < 0) {
    throw new Error(p.room + ' 必須指定床位：' + roomDef.beds.join('／'));
  }
  if (roomDef.beds.length === 0 && bed) {
    throw new Error(p.room + ' 是整間出租，不應指定床位');
  }

  if (!p.force && isOccupied(p.room, bed)) {
    return { ok: false, warn: '床位重複',
      message: (p.room + ' ' + bed).trim() + ' 目前已有待簽或在住的合約。確定要建立嗎？' };
  }

  const s = getSettings();
  const months = Number(s['term.months'] || 6);
  const start = new Date(p.term_start);
  const end = addMonthsMinusDay(start, months);

  const id = nextId('C', 'contracts', 'contract_id');
  const token = genToken();

  appendRow('contracts', {
    contract_id: id, token: token,
    name: p.name, id_no: '', phone: '', mail_addr: p.mail_addr || '',  // 身分資料由同仁簽署時自填（Eason 2026-07-23）
    room: p.room, bed: bed, room_type: roomDef.type, rent: rentOf(p.room),
    deposit_type: '免押金', deposit_amt: 0,  // 2026-07-23 Eason：實際未收押金，條文已刪押金敘述
    fee_mgmt: p.fee_mgmt || '由出租人負擔',
    fee_water: p.fee_water || '由出租人負擔',
    fee_power: p.fee_power || '由出租人負擔',
    term_start: fmtDate(start), term_end: fmtDate(end), term_no: 1,
    status: '待簽', terminate_flag: '', notified_at: '',
    equip_json: '', signed_at: '', signed_ip: '', signed_ua: '',
    sign_img_id: '', pdf_id: '',
    terms_ver: TERMS_VERSION, created_at: nowStr(),
  });

  logAudit('create', id, e, (p.room + ' ' + bed).trim() + '／' + p.name);

  return {
    ok: true, contract_id: id, token: token,
    rent: rentOf(p.room), term_start: fmtDate(start), term_end: fmtDate(end),
    sign_url: SITE_BASE + 'sign.html?t=' + token,
  };
}

function listContracts() {
  return readSheet('contracts').map(function (r) {
    return {
      contract_id: r.contract_id, name: r.name,
      room: r.room, bed: r.bed, rent: r.rent,
      term_start: fmtDate(r.term_start), term_end: fmtDate(r.term_end), term_no: r.term_no,
      status: r.status, terminate_flag: r.terminate_flag,
      signed_at: fmtDateTime(r.signed_at), pdf_id: r.pdf_id, token: r.token,
    };
  });
}

/** Phase 2 才會用到，這裡先放最小版本供測試 */
function getContractByToken(token, e) {
  if (!token) throw new Error('缺少 token');
  const hit = readSheet('contracts').filter(function (r) { return r.token === token; })[0];
  if (!hit) throw new Error('連結無效');
  logAudit('open', hit.contract_id, e, '');
  return {
    ok: true,
    state: hit.status === '待簽' ? 'pending' : 'signed',
    contract: {
      contract_id: hit.contract_id, name: hit.name, id_no: hit.id_no,
      phone: hit.phone, mail_addr: hit.mail_addr,
      room: hit.room, bed: hit.bed, room_bed: (hit.room + ' ' + hit.bed).trim(),
      rent: hit.rent, deposit_type: hit.deposit_type, deposit_amt: hit.deposit_amt,
      term_start: fmtDate(hit.term_start), term_end: fmtDate(hit.term_end),
      terms_ver: hit.terms_ver, pdf_id: hit.pdf_id,
    },
    equip: EQUIP_ITEMS,
    terms: renderTerms(hit),
  };
}

// ────────────────────────────────────────────
// 本機自測用（在編輯器直接跑，不經 HTTP）
// ────────────────────────────────────────────

/** TASK-02／03 驗收：token、編號、房型費率、床位重複 */
function testPhase1() {
  const t = [];
  for (let i = 0; i < 100; i++) t.push(genToken());
  const uniq = t.filter(function (v, i) { return t.indexOf(v) === i; }).length;
  const fmtOk = t.every(function (v) { return /^[0-9a-f]{32}$/.test(v); });
  Logger.log('① token：100 個產生 ' + uniq + ' 個不重複，格式全部合格＝' + fmtOk);

  const expect = { '二樓單人房': 3500, '二樓四人房': 1500, '三樓單人房': 3500,
                   '三樓1號房': 2000, '三樓2號房': 3500, '三樓3號房': 2000 };
  const rentOk = Object.keys(expect).every(function (r) { return rentOf(r) === expect[r]; });
  Logger.log('② 六種房間租金對照＝' + rentOk +
             '（' + Object.keys(expect).map(function (r) { return r + ':' + rentOf(r); }).join('、') + '）');

  const end = addMonthsMinusDay(new Date('2026-08-01'), 6);
  Logger.log('③ 租期：2026-08-01 起六個月 → ' + fmtDate(end) + '（應為 2027-01-31）');

  const s = getSettings();
  Logger.log('④ settings 讀到 ' + Object.keys(s).length + ' 個 key；清潔費＝' + s['fee.cleaning']);
  Logger.log('　 出租人統編＝「' + (s['lessor.taxid'] || '（未填）') + '」');
}

/** 建三筆測試合約，驗編號流水與床位重複警告 */
function testCreateThree() {
  const pass = getSettings()['admin.pass'];
  const base = { pass: pass, mail_addr: '新竹市測試路1號', term_start: '2026-08-01' };
  const r1 = createContract(Object.assign({}, base, { name: '測試一', room: '二樓單人房' }));
  const r2 = createContract(Object.assign({}, base, { name: '測試二', room: '三樓1號房', bed: '雙人床位A' }));
  const r3 = createContract(Object.assign({}, base, { name: '測試三', room: '三樓1號房', bed: '雙人床位A' }));
  Logger.log('① 第一筆：' + r1.contract_id + '　租金 ' + r1.rent + '　租期 ' + r1.term_start + '~' + r1.term_end);
  Logger.log('② 第二筆：' + r2.contract_id + '　租金 ' + r2.rent);
  Logger.log('③ 第三筆（同床位）：' + JSON.stringify(r3));
  Logger.log('　 → 第三筆應該回 warn:床位重複，而不是建立成功');
}

/** 清掉測試資料（contracts 裡姓名以「測試」開頭的列） */
function cleanupTestContracts() {
  const sh = getSheet('contracts');
  const rows = readSheet('contracts');
  const del = rows.filter(function (r) { return String(r.name).indexOf('測試') === 0; })
                  .map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
  del.forEach(function (row) { sh.deleteRow(row); });
  Logger.log('清掉 ' + del.length + ' 筆測試合約');
}
