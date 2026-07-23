/**
 * TASK-07　合約 PDF 產生與歸檔
 *
 * 做法照 TASK-00 驗證過的路線：程式建立 Google Docs → 匯出 PDF → 存雲端硬碟 → 刪暫存 Doc。
 * 文字一律來自 Terms.gs（唯一來源），這裡只負責排版。
 */

function buildContractPdf(contractId) {
  const c = readSheet('contracts').filter(function (r) { return r.contract_id === contractId; })[0];
  if (!c) throw new Error('找不到合約：' + contractId);
  const s = getSettings();
  const t = renderTerms(c);
  const ph = t.placeholders;

  const doc = DocumentApp.create('__tmp_' + contractId);
  const body = doc.getBody();
  body.clear();
  body.setMarginTop(54).setMarginBottom(54).setMarginLeft(62).setMarginRight(62);

  const FONT = 'Noto Sans TC';
  const p = function (text, opt) {
    const o = opt || {};
    const el = body.appendParagraph(text || '');
    el.setFontFamily(FONT).setFontSize(o.size || 10.5).setBold(!!o.bold)
      .setLineSpacing(o.line || 1.35)
      .setSpacingBefore(o.before === undefined ? 4 : o.before)
      .setSpacingAfter(o.after === undefined ? 0 : o.after);
    if (o.center) el.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    if (o.color) el.setForegroundColor(o.color);
    return el;
  };

  // ── 封面 ───────────────────────────────
  const logos = p('', { center: true, before: 56 });
  logos.appendInlineImage(Utilities.newBlob(Utilities.base64Decode(LOGO_MALA_B64), 'image/jpeg'))
       .setWidth(78).setHeight(78);
  logos.appendText('　　');
  logos.appendInlineImage(Utilities.newBlob(Utilities.base64Decode(LOGO_MOZHU_B64), 'image/jpeg'))
       .setWidth(78).setHeight(74);

  p('鼎兆元餐飲集團', { center: true, size: 13, before: 26 });
  p('宿舍租賃契約書', { center: true, size: 27, bold: true, before: 18 });

  p('承租人：' + ph.tenant_name, { center: true, size: 12, before: 66 });
  p('租賃標的：' + ph.property_addr + '　' + ph.room_bed, { center: true, size: 12 });
  p('租賃期間：' + ph.term_start_roc + ' 至 ' + ph.term_end_roc, { center: true, size: 12 });
  p('簽署日期：' + ph.sign_date_roc, { center: true, size: 12 });

  // 2026-07-23 Eason 指示：封面不加公司大章（簽署欄仍蓋）。
  p('合約編號 ' + c.contract_id + '　條文版本 ' + t.version,
    { center: true, size: 8, color: '#999999', before: 120 });

  body.appendPageBreak();

  // ── 契約條文 ────────────────────────────
  p('立契約書人承租人 ' + ph.tenant_name + '，出租人 ' + ph.lessor_name
    + '，茲為住宅租賃事宜，雙方同意本契約條款如下：', { size: 10.5, before: 0, after: 6 });

  t.clauses.forEach(function (cl) {
    p(cl.no + '　' + cl.title, { bold: true, size: 11.5, before: 13, after: 2 });
    p(cl.body, { size: 10.5 });
  });

  // ── 附件一 ─────────────────────────────
  body.appendPageBreak();
  p(t.annex1.title, { bold: true, size: 13, before: 0, after: 6 });
  // 簽約當下的點收狀態：有提供→正常／未歸還；同仁點收時取消勾選的→未提供
  let provided = {};
  try { JSON.parse(c.equip_json || '[]').forEach(function (x) { provided[x.item] = !!x.ok; }); } catch (err) {}
  const hasEquipData = Object.keys(provided).length > 0;
  const rows = [['設備項目', '數量', '賠償單價', '狀態', '是否歸還']];
  t.annex1.prices.forEach(function (x) {
    const has = hasEquipData ? provided[x.item] : true;
    rows.push(has
      ? [x.item, String(x.qty), x.price.toLocaleString(), '正常（已點收）', '未歸還']
      : [x.item, '—', '—', '未提供', '—']);
  });
  const table = body.appendTable(rows);
  table.setBorderWidth(0.5);
  for (let r = 0; r < rows.length; r++) {
    for (let col = 0; col < rows[r].length; col++) {
      const cell = table.getCell(r, col);
      cell.setFontFamily(FONT).setFontSize(9.5).setBold(r === 0);
      if (r === 0) cell.setBackgroundColor('#f0ece8');
    }
  }
  p(t.annex1.footer, { size: 9.5, before: 8 });

  // ── 附件二 ─────────────────────────────
  body.appendPageBreak();
  p(t.annex2.title, { bold: true, size: 13, before: 0, after: 6 });
  t.annex2.sections.forEach(function (sec) {
    p(sec.title, { bold: true, size: 11, before: 10, after: 2 });
    p(sec.body, { size: 10 });
  });

  // ── 簽署欄 ─────────────────────────────
  body.appendPageBreak();
  p('立契約書人', { bold: true, size: 13, before: 0, after: 8 });

  p('出租人', { bold: true, size: 11, before: 10 });
  p('名稱：' + ph.lessor_name);
  p('統一編號：' + ph.lessor_taxid);
  p('營業登記地址：' + ph.lessor_addr);
  p('聯絡電話：' + ph.lessor_phone);
  const sealSign = p('', { before: 4 });
  sealSign.appendInlineImage(Utilities.newBlob(Utilities.base64Decode(SEAL_B64), 'image/jpeg'))
          .setWidth(88).setHeight(88);

  p('承租人', { bold: true, size: 11, before: 18 });
  p('姓名：' + ph.tenant_name);
  p('身分證統一編號：' + ph.id_no);
  p('通訊地址：' + ph.mail_addr);
  p('聯絡電話：' + ph.phone);
  p('電子簽名：', { before: 4 });
  if (c.sign_img_id) {
    const signPara = p('', { before: 2 });
    signPara.appendInlineImage(DriveApp.getFileById(c.sign_img_id).getBlob())
            .setWidth(210).setHeight(77);
  }

  p(ph.sign_date_roc, { before: 16, size: 11 });

  // 存證註記
  p('簽署系統紀錄：簽署時間 ' + (c.signed_at || '') +
    '　裝置 ' + String(c.signed_ua || '').slice(0, 60) +
    '　連結識別碼 ' + String(c.token || '').slice(0, 8) + '…',
    { size: 7.5, color: '#8a8a8a', before: 14 });

  doc.saveAndClose();

  // ── 匯出、歸檔 ─────────────────────────
  const docFile = DriveApp.getFileById(doc.getId());
  const dateStr = fmtDate(c.signed_at || new Date());
  const name = dateStr + '_' + c.name + '_宿舍合約.pdf';
  const blob = docFile.getAs('application/pdf').setName(name);
  const folder = DriveApp.getFolderById(String(s['drive.folder_id']));

  // 同名舊檔先丟垃圾桶，避免重跑產生一堆重複
  const olds = folder.getFilesByName(name);
  while (olds.hasNext()) olds.next().setTrashed(true);

  const pdf = folder.createFile(blob);
  docFile.setTrashed(true);
  updateRow('contracts', c._row, { pdf_id: pdf.getId() });
  logAudit('pdf', c.contract_id, null, name);
  return pdf.getUrl();
}

/** 驗收用：拿最新一筆合約產一份 PDF */
function testBuildPdf() {
  const rows = readSheet('contracts');
  if (!rows.length) { Logger.log('contracts 沒有資料，請先用 testCreateThree 建一筆'); return; }
  const c = rows[rows.length - 1];
  Logger.log('用這筆產 PDF：' + c.contract_id + '　' + c.name);
  Logger.log('✅ ' + buildContractPdf(c.contract_id));
}
