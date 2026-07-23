/**
 * TASK-00　PDF 產出最小驗證
 *
 * 驗四件事：
 *   ① 中文不破字　② 手寫簽名圖有嵌進去　③ 大章有嵌進去　④ 封面自成一頁
 *
 * 做法上有一個與 spec 不同的調整：範本 Doc 不用手做，改由程式建立。
 * 理由是範本一旦手做，條文就有一份不在版本控制裡，日後改條文兩邊會不一致
 * （plan.html 的 TASK-04 已把「同一份文字來源」列為最容易出的錯）。
 *
 * 執行：直接跑 spikeMakePdf()，看執行紀錄印出的 PDF 連結。
 */

// 2026-07-23 更新：原資料夾 193VG… 在另一個 Google 帳號，執行帳號讀不到，
// 改用 Eason 指定的這個（與執行腳本同帳號）。
const SPIKE_FOLDER_ID = '1l_6zoL1eOkc4Rpby-MlZFrMor8Ba7wZH';

function spikeMakePdf() {
  const data = {
    tenant_name: '王小明',
    room_bed: '三樓1號房 雙人床位A',
    term_text: '民國115年8月1日至民國116年1月31日',
    rent: '2,000',
    sign_date: '民國115年8月1日',
    lessor_name: '鼎兆元股份有限公司',
  };

  const doc = DocumentApp.create('__spike_tmp_' + Utilities.getUuid().slice(0, 8));
  const body = doc.getBody();
  body.clear();
  body.setMarginTop(56).setMarginBottom(56).setMarginLeft(64).setMarginRight(64);

  // ── 封面（第 1 頁）─────────────────────────────
  // 兩個品牌 logo 並排（住宿同仁來自小辛辣與墨竹亭）
  const logoPara = body.appendParagraph('');
  logoPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingBefore(60);
  const malaBlob = Utilities.newBlob(Utilities.base64Decode(LOGO_MALA_B64), 'image/jpeg', 'mala.jpg');
  const mozhuBlob = Utilities.newBlob(Utilities.base64Decode(LOGO_MOZHU_B64), 'image/jpeg', 'mozhu.jpg');
  logoPara.appendInlineImage(malaBlob).setWidth(78).setHeight(78);
  logoPara.appendText('　　');
  logoPara.appendInlineImage(mozhuBlob).setWidth(78).setHeight(74);

  const brand = body.appendParagraph('鼎兆元餐飲集團');
  brand.setAlignment(DocumentApp.HorizontalAlignment.CENTER)
       .setFontSize(14).setFontFamily('Noto Sans TC').setSpacingBefore(28);

  const title = body.appendParagraph('宿舍租賃契約書');
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER)
       .setFontSize(28).setBold(true).setFontFamily('Noto Sans TC').setSpacingBefore(24);

  const coverLines = [
    '承租人：{{tenant_name}}',
    '租賃標的：新竹市光復路一段435號　{{room_bed}}',
    '租賃期間：{{term_text}}',
    '簽署日期：{{sign_date}}',
  ];
  coverLines.forEach(function (line, i) {
    const p = body.appendParagraph(line);
    p.setAlignment(DocumentApp.HorizontalAlignment.CENTER)
     .setFontSize(12).setFontFamily('Noto Sans TC')
     .setSpacingBefore(i === 0 ? 80 : 6);
  });

  // 封面下方蓋大章，驗證圖片嵌入
  const sealPara = body.appendParagraph('');
  sealPara.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingBefore(60);
  const sealBlob = Utilities.newBlob(Utilities.base64Decode(SEAL_B64), 'image/jpeg', 'seal.jpg');
  sealPara.appendInlineImage(sealBlob).setWidth(110).setHeight(110);

  body.appendPageBreak();

  // ── 本文（第 2 頁起）───────────────────────────
  // 取兩段真實條文（含最容易破字的字），驗中文渲染
  const clauses = [
    ['第一條　租賃標的',
     '(一)租賃住宅標示：門牌　新竹市光復路一段435號。\n' +
     '(二)租賃範圍：承租人承租之房間／床位為：{{room_bed}}\n' +
     '　　（房間／床位由出租人於簽約時載明，範圍以本項所載者為限；房間內非屬其承租範圍之區域及他人床位，不得占用。）'],
    ['第三條　租金約定及支付',
     // 2026-07-23 Eason 指示：房型費率清單不顯示在合約上，只留該同仁自己的金額。
     '本契約承租人應負擔之金額為每月新臺幣 {{rent}} 元整，由薪資直接扣款，不得藉任何理由拖延或拒絕。\n' +
     '承租人同意，本契約及其附件所生應由承租人負擔之各項費用（含住宿費用、設備賠償金、清潔費用），出租人得自其薪資中扣除。'],
    ['第十八條　電子簽署之效力',
     '一、租賃雙方同意本契約及其附件（含承租人歸還設備範圍明細表、宿舍規約）得以電子文件方式作成，並以電子簽章方式簽署。雙方同意依電子簽章法規定，該電子文件與電子簽章與紙本文件及手寫簽名、蓋章具同等效力，任一方不得僅因其為電子形式而否認其效力。\n' +
     '二、承租人於出租人指定之簽署系統上，以手寫方式繪製簽名並完成送出者，視為承租人本人之簽名。'],
  ];
  clauses.forEach(function (c) {
    const h = body.appendParagraph(c[0]);
    h.setFontSize(13).setBold(true).setFontFamily('Noto Sans TC').setSpacingBefore(18).setSpacingAfter(4);
    const p = body.appendParagraph(c[1]);
    p.setFontSize(11).setBold(false).setFontFamily('Noto Sans TC').setLineSpacing(1.4);
  });

  // 附件一：賠償單價表，驗表格與數字
  const tableHead = body.appendParagraph('附件一　承租人歸還設備範圍明細表（賠償單價）');
  tableHead.setFontSize(13).setBold(true).setFontFamily('Noto Sans TC').setSpacingBefore(22);
  const rows = [
    ['設備項目', '數量', '賠償單價'],
    ['書桌', '1', '2,000'], ['椅子', '1', '1,000'],
    ['床架', '1', '3,500'], ['床墊', '1', '3,500'],
    ['衣櫃', '1', '4,000'], ['房間鑰匙', '1', '100'],
    ['大門遙控器', '1', '800'],
  ];
  const table = body.appendTable(rows);
  table.setBorderWidth(0.5);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = table.getCell(r, c);
      cell.setFontSize(10).setFontFamily('Noto Sans TC');
      if (r === 0) cell.setBold(true);
    }
  }

  // ── 簽署欄：手寫簽名圖 ＋ 大章 ────────────────
  const signHead = body.appendParagraph('立契約書人');
  signHead.setFontSize(13).setBold(true).setFontFamily('Noto Sans TC').setSpacingBefore(26);

  const tenantLabel = body.appendParagraph('承租人（電子簽名）：');
  tenantLabel.setFontSize(11).setBold(false).setFontFamily('Noto Sans TC');
  const signPara = body.appendParagraph('');
  const signBlob = Utilities.newBlob(Utilities.base64Decode(SIGN_TEST_B64), 'image/png', 'sign.png');
  signPara.appendInlineImage(signBlob).setWidth(200).setHeight(73);

  const lessorLabel = body.appendParagraph('出租人：{{lessor_name}}');
  lessorLabel.setFontSize(11).setBold(false).setFontFamily('Noto Sans TC').setSpacingBefore(10);
  const lessorSeal = body.appendParagraph('');
  lessorSeal.appendInlineImage(sealBlob.copyBlob()).setWidth(90).setHeight(90);

  const stamp = body.appendParagraph('簽署時間：2026-08-01 14:23:07（系統紀錄）　IP：203.0.113.45');
  stamp.setFontSize(8).setBold(false).setFontFamily('Noto Sans TC')
       .setForegroundColor('#888888').setSpacingBefore(12);

  // ── 佔位符替換 ────────────────────────────────
  Object.keys(data).forEach(function (k) {
    body.replaceText('\\{\\{' + k + '\\}\\}', data[k]);
  });

  doc.saveAndClose();

  // ── 匯出 PDF → 存雲端硬碟 → 刪暫存 Doc ────────
  const docFile = DriveApp.getFileById(doc.getId());
  const pdfBlob = docFile.getAs('application/pdf');
  // 正式檔名格式為 2026-08-01_王小明_宿舍合約.pdf；
  // 本次是假資料，加上【測試】前綴避免日後被誤認成真的合約。
  const prodName = '2026-08-01_王小明_宿舍合約.pdf';
  pdfBlob.setName('【測試】' + prodName);
  const folder = DriveApp.getFolderById(SPIKE_FOLDER_ID);
  const pdf = folder.createFile(pdfBlob);
  docFile.setTrashed(true);

  const url = pdf.getUrl();
  Logger.log('✅ TASK-00 PDF 已產出：' + url);
  Logger.log('檔名：' + pdf.getName() + '（正式格式：' + prodName + '）　大小：'
             + Math.round(pdf.getSize() / 1024) + ' KB');
  return url;
}
