/**
 * TASK-06 後端　同仁送出簽署
 *
 * 存證能留下什麼（Apps Script 平台限制）：
 *   ✅ 伺服器時間戳（不信任前端傳來的時間）
 *   ✅ 簽署內容（設備點收結果、條文版本）
 *   ✅ 裝置瀏覽器資訊（UA，由前端送）
 *   ✅ 專屬 token
 *   ❌ 用戶端 IP —— Google 不把 HTTP 標頭交給 Web App，除非另接第三方查詢服務。
 *      settings 的 collect.ip 若為 TRUE，才採用前端送來的 ip 欄位。
 */

function submitSign(p, e) {
  if (!p.token) throw new Error('缺少 token');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const hit = readSheet('contracts').filter(function (r) { return r.token === p.token; })[0];
    if (!hit) throw new Error('連結無效');
    if (hit.status !== '待簽') {
      return { ok: false, error: '這份合約已經簽署過了', state: 'signed' };
    }
    if (!p.sign_png) throw new Error('缺少簽名');

    // 身分資料由同仁自填（後端也驗一次，不信前端）
    const idNo = String(p.id_no || '').trim().toUpperCase();
    const phone = String(p.phone || '').trim();
    if (!/^[A-Z]{1,2}[0-9]{8,9}$/.test(idNo)) throw new Error('身分證字號（或居留證號）格式不正確');
    if (!/^[0-9+\-() ]{8,15}$/.test(phone)) throw new Error('聯絡電話格式不正確');

    const equip = p.equip || [];
    if (!equip.length) throw new Error('缺少設備點收結果');

    // 簽名圖存雲端硬碟
    const folder = DriveApp.getFolderById(String(getSettings()['drive.folder_id']));
    const b64 = String(p.sign_png).replace(/^data:image\/png;base64,/, '');
    const signBlob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png',
      'sign_' + hit.contract_id + '.png');
    const signFile = folder.createFile(signBlob);

    const ts = nowStr();
    const useIp = String(getSettings()['collect.ip']).toUpperCase() === 'TRUE';
    updateRow('contracts', hit._row, {
      // 前置單引號強制試算表存文字，避免 0987… 被轉成數字吃掉開頭的 0
      id_no: idNo, phone: "'" + phone, mail_addr: String(p.mail_addr || hit.mail_addr || '').trim(),
      equip_json: JSON.stringify(equip),
      signed_at: ts,
      signed_ip: useIp ? String(p.ip || '') : '（平台不提供）',
      signed_ua: String(p.ua || ''),
      sign_img_id: signFile.getId(),
      status: '在住',
    });

    logAudit('sign', hit.contract_id, e,
      '設備點收：' + equip.filter(function (x) { return x.ok; }).length + '/' + equip.length
      + '　UA：' + String(p.ua || '').slice(0, 80));

    const pdfUrl = buildContractPdf(hit.contract_id);
    return { ok: true, pdf_url: pdfUrl, signed_at: ts };
  } finally {
    lock.releaseLock();
  }
}
