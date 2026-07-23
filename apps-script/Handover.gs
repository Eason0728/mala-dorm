/**
 * TASK-09／10　退宿點交：建單、取單、簽署、賠償計算、PDF
 *
 * 賠償規則：設備「異常（可歸責）」或「未歸還」→ 計該項單價；勾「需清潔」→ 加清潔費。
 * 金額一律以後端 settings 重算，不信任前端傳來的總額。
 */

const SITE_BASE = 'https://eason0728.github.io/mala-dorm/';

function createHandover(p, e) {
  requireAdmin(p);
  if (!p.contract_id) throw new Error('缺少 contract_id');
  const c = readSheet('contracts').filter(function (r) { return r.contract_id === p.contract_id; })[0];
  if (!c) throw new Error('找不到合約：' + p.contract_id);
  if (c.status !== '在住') throw new Error('狀態為「' + c.status + '」，只有在住合約可以開點交單');

  // 已有未完成的點交單就直接回同一張，避免重複開
  const existing = readSheet('handovers').filter(function (h) {
    return h.contract_id === p.contract_id && !h.signed_at;
  })[0];
  if (existing) {
    return { ok: true, handover_id: existing.handover_id, token: existing.token,
             url: SITE_BASE + 'handover.html?t=' + existing.token, reused: true };
  }

  const id = nextId('H', 'handovers', 'handover_id');
  const token = genToken();
  appendRow('handovers', {
    handover_id: id, contract_id: p.contract_id, token: token,
    items_json: '', need_cleaning: '', compensation_total: '',
    signed_at: '', signed_ip: '', signed_ua: '', sign_img_id: '', pdf_id: '',
    created_at: nowStr(),
  });
  logAudit('handover_create', id, e, p.contract_id + '／' + c.name);
  return { ok: true, handover_id: id, token: token, url: SITE_BASE + 'handover.html?t=' + token };
}

function getHandoverByToken(token, e) {
  if (!token) throw new Error('缺少 token');
  const h = readSheet('handovers').filter(function (r) { return r.token === token; })[0];
  if (!h) throw new Error('連結無效');
  const c = readSheet('contracts').filter(function (r) { return r.contract_id === h.contract_id; })[0];
  if (!c) throw new Error('找不到對應合約');
  const s = getSettings();
  logAudit('handover_open', h.handover_id, e, '');
  return {
    ok: true,
    state: h.signed_at ? 'signed' : 'pending',
    handover: {
      handover_id: h.handover_id, contract_id: c.contract_id,
      name: c.name, room_bed: (c.room + ' ' + (c.bed || '')).trim(),
      term_start: fmtDate(c.term_start), term_end: fmtDate(c.term_end),
      signed_at: h.signed_at ? fmtDateTime(h.signed_at) : '',
      pdf_url: h.pdf_id ? 'https://drive.google.com/file/d/' + h.pdf_id + '/view' : '',
      items: h.items_json ? JSON.parse(h.items_json) : null,
      compensation_total: h.compensation_total,
    },
    equip: EQUIP_ITEMS.map(function (k) {
      return { item: k, price: Number(s['price.' + k] || 0) };
    }),
    cleaning_fee: Number(s['fee.cleaning'] || 3000),
  };
}

/** 後端重算賠償金額（唯一的權威計算） */
function calcCompensation(items, needCleaning) {
  const s = getSettings();
  let total = 0;
  const lines = [];
  items.forEach(function (it) {
    const price = Number(s['price.' + it.item] || 0);
    const bad = it.normal === false || it.returned === false;
    if (bad) { total += price; lines.push(it.item + '：' + price); }
  });
  if (needCleaning) {
    const fee = Number(s['fee.cleaning'] || 3000);
    total += fee; lines.push('清潔費：' + fee);
  }
  return { total: total, lines: lines };
}

function submitHandover(p, e) {
  if (!p.token) throw new Error('缺少 token');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const h = readSheet('handovers').filter(function (r) { return r.token === p.token; })[0];
    if (!h) throw new Error('連結無效');
    if (h.signed_at) return { ok: false, error: '這張點交單已經完成了', state: 'signed' };
    if (!p.sign_png) throw new Error('缺少簽名');

    const items = p.items || [];
    if (items.length !== EQUIP_ITEMS.length) throw new Error('設備清單不完整');

    const comp = calcCompensation(items, !!p.need_cleaning);

    const folder = DriveApp.getFolderById(String(getSettings()['drive.folder_id']));
    const b64 = String(p.sign_png).replace(/^data:image\/png;base64,/, '');
    const signFile = folder.createFile(
      Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'sign_' + h.handover_id + '.png'));

    const ts = nowStr();
    updateRow('handovers', h._row, {
      items_json: JSON.stringify(items),
      need_cleaning: p.need_cleaning ? 'TRUE' : '',
      compensation_total: comp.total,
      signed_at: ts, signed_ip: '（不收集）', signed_ua: String(p.ua || ''),
      sign_img_id: signFile.getId(),
    });

    const c = readSheet('contracts').filter(function (r) { return r.contract_id === h.contract_id; })[0];
    updateRow('contracts', c._row, { status: '已退宿' });

    logAudit('handover_sign', h.handover_id, e,
      '賠償 ' + comp.total + '（' + (comp.lines.join('、') || '無') + '）');

    const pdfUrl = buildHandoverPdf(h.handover_id);
    return { ok: true, pdf_url: pdfUrl, compensation_total: comp.total, signed_at: ts };
  } finally {
    lock.releaseLock();
  }
}

function buildHandoverPdf(handoverId) {
  const h = readSheet('handovers').filter(function (r) { return r.handover_id === handoverId; })[0];
  if (!h) throw new Error('找不到點交單：' + handoverId);
  const c = readSheet('contracts').filter(function (r) { return r.contract_id === h.contract_id; })[0];
  const s = getSettings();
  const items = JSON.parse(h.items_json || '[]');

  const doc = DocumentApp.create('__tmp_' + handoverId);
  const body = doc.getBody();
  body.clear();
  body.setMarginTop(54).setMarginBottom(54).setMarginLeft(62).setMarginRight(62);
  const FONT = 'Noto Sans TC';
  const p = function (text, opt) {
    const o = opt || {};
    const el = body.appendParagraph(text || '');
    el.setFontFamily(FONT).setFontSize(o.size || 10.5).setBold(!!o.bold)
      .setLineSpacing(1.35).setSpacingBefore(o.before === undefined ? 4 : o.before);
    if (o.center) el.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    if (o.color) el.setForegroundColor(o.color);
    return el;
  };

  const logos = p('', { center: true, before: 8 });
  logos.appendInlineImage(Utilities.newBlob(Utilities.base64Decode(LOGO_MALA_B64), 'image/jpeg'))
       .setWidth(54).setHeight(54);
  logos.appendText('　');
  logos.appendInlineImage(Utilities.newBlob(Utilities.base64Decode(LOGO_MOZHU_B64), 'image/jpeg'))
       .setWidth(54).setHeight(51);
  p('承租人歸還設備範圍明細表', { center: true, size: 19, bold: true, before: 10 });
  p('承租人：' + c.name + '　　房間／床位：' + (c.room + ' ' + (c.bed || '')).trim(), { center: true, size: 11, before: 10 });
  p('原租賃期間：' + fmtRoc(c.term_start) + ' 至 ' + fmtRoc(c.term_end)
    + '　　點交日期：' + fmtRoc(String(h.signed_at || nowStr()).slice(0, 10)), { center: true, size: 10 });

  const rows = [['設備項目', '賠償單價', '狀態', '是否歸還', '說明']];
  items.forEach(function (it) {
    rows.push([
      it.item,
      Number(s['price.' + it.item] || 0).toLocaleString(),
      it.normal === false ? '異常' : '正常',
      it.returned === false ? '未歸還' : '已歸還',
      it.note || '',
    ]);
  });
  const table = body.appendTable(rows);
  table.setBorderWidth(0.5);
  for (let r = 0; r < rows.length; r++) {
    for (let col = 0; col < rows[r].length; col++) {
      const cell = table.getCell(r, col);
      cell.setFontFamily(FONT).setFontSize(9.5).setBold(r === 0);
      if (r === 0) cell.setBackgroundColor('#f0ece8');
      if (r > 0 && (rows[r][2] === '異常' || rows[r][3] === '未歸還'))
        cell.setForegroundColor('#b3261e');
    }
  }

  p('房間復原狀況：' + (String(h.need_cleaning) === 'TRUE'
      ? '未回復原狀或留有私人物品，收取清潔費 ' + Number(s['fee.cleaning'] || 3000).toLocaleString() + ' 元'
      : '已回復原狀，無遺留物'), { before: 10 });
  p('應賠償金額合計：新臺幣 ' + Number(h.compensation_total || 0).toLocaleString() + ' 元整',
    { bold: true, size: 12, before: 6 });
  p('上列金額依宿舍租賃契約第三條第二項約定辦理：經承租人書面確認金額無誤後，得自當期薪資代扣，或由承租人另行以現金、轉帳方式支付。',
    { size: 9, color: '#666666' });

  p('承租人（電子簽名）：', { before: 18 });
  if (h.sign_img_id) {
    const sp = p('', { before: 2 });
    sp.appendInlineImage(DriveApp.getFileById(h.sign_img_id).getBlob()).setWidth(180).setHeight(66);
  }
  p('出租人：' + String(s['lessor.name'] || ''), { before: 8 });
  const sealP = p('', { before: 2 });
  sealP.appendInlineImage(Utilities.newBlob(Utilities.base64Decode(SEAL_B64), 'image/jpeg'))
       .setWidth(76).setHeight(76);

  p('簽署系統紀錄：' + fmtDateTime(h.signed_at) + '　裝置 ' + String(h.signed_ua || '').slice(0, 60)
    + '　單號 ' + h.handover_id, { size: 7.5, color: '#8a8a8a', before: 12 });

  doc.saveAndClose();
  const docFile = DriveApp.getFileById(doc.getId());
  const name = fmtDate(h.signed_at || new Date()) + '_' + c.name + '_設備點交.pdf';
  const blob = docFile.getAs('application/pdf').setName(name);
  const folder = DriveApp.getFolderById(String(s['drive.folder_id']));
  const olds = folder.getFilesByName(name);
  while (olds.hasNext()) olds.next().setTrashed(true);
  const pdf = folder.createFile(blob);
  docFile.setTrashed(true);
  updateRow('handovers', h._row, { pdf_id: pdf.getId() });
  logAudit('handover_pdf', h.handover_id, null, name);
  return pdf.getUrl();
}
