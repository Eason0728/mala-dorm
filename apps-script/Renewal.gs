/**
 * TASK-11／13　每日到期檢查 ＋ Email 提醒
 *
 * 規則（條文 v2.3 第二條）：
 *   - 期滿前 30 天：寄一封提醒信給 notify.email（一筆只寄一次，notified_at 防重複）。
 *   - 期滿仍未標記終止：轉為「不定期租賃（月租制）」，不重簽、不改租金；term_no 標記為 不定期。
 *   - 已標記終止的：期滿後不轉換，等開點交單。
 * 當天沒有任何事就完全不寄信。
 */

function dailyCheck() {
  const s = getSettings();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const soonDays = Number(s['renew.notice_days'] || 30);
  const notices = [];

  readSheet('contracts').forEach(function (r) {
    if (r.status !== '在住') return;
    if (String(r.term_no).indexOf('不定期') === 0) return;  // 已轉月租制，不再看 term_end

    const end = new Date(r.term_end); end.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((end - today) / 86400000);
    const who = r.name + '（' + (r.room + ' ' + (r.bed || '')).trim() + '）';

    if (daysLeft < 0) {
      if (r.terminate_flag) {
        // 已通知終止且過期：提醒開點交單（只提醒一次，藉 notified_at 帶記號）
        if (String(r.notified_at).indexOf('點交提醒') < 0) {
          updateRow('contracts', r._row, { notified_at: '點交提醒 ' + nowStr() });
          notices.push('📦 ' + who + ' 已於 ' + fmtDate(r.term_end) +
            ' 期滿且已通知終止，請開點交單完成退宿。');
        }
      } else {
        updateRow('contracts', r._row, { term_no: '不定期' });
        logAudit('convert_indefinite', r.contract_id, null, '期滿未通知，轉不定期租賃（月租制）');
        notices.push('🔁 ' + who + ' 首期已於 ' + fmtDate(r.term_end) +
          ' 期滿，未收到終止通知，依契約第二條轉為不定期租賃（月租制）。之後任一方一個月前通知即可終止。');
      }
    } else if (daysLeft <= soonDays && !r.notified_at) {
      updateRow('contracts', r._row, { notified_at: nowStr() });
      notices.push('⏰ ' + who + ' 本期將於 ' + fmtDate(r.term_end) + ' 期滿（剩 ' + daysLeft +
        ' 天）。若要終止或換房，請於期滿一個月前通知同仁並在後台標記；未處理將轉為不定期租賃（月租制）。');
    }
  });

  if (notices.length) {
    MailApp.sendEmail({
      to: String(s['notify.email'] || 'madesiaosinla@gmail.com'),
      subject: '宿舍合約：' + notices.length + ' 筆需要注意',
      body: notices.join('\n\n') + '\n\n後台：' + SITE_BASE + 'admin.html\n（此信由宿舍合約系統自動寄出）',
    });
    logAudit('notify_email', '', null, notices.length + ' 筆');
  }
  Logger.log('dailyCheck 完成：' + notices.length + ' 筆通知' + (notices.length ? '\n' + notices.join('\n') : ''));
  return notices.length;
}

/** 管理端：標記已通知終止（期滿後不轉不定期，等點交） */
function markTerminate(p, e) {
  requireAdmin(p);
  const c = readSheet('contracts').filter(function (r) { return r.contract_id === p.contract_id; })[0];
  if (!c) throw new Error('找不到合約');
  if (c.status !== '在住') throw new Error('只有在住合約可以標記終止');
  const flag = c.terminate_flag ? '' : '已通知終止 ' + fmtDate(new Date());
  updateRow('contracts', c._row, { terminate_flag: flag });
  logAudit('terminate_' + (flag ? 'set' : 'unset'), c.contract_id, e, '');
  return { ok: true, terminate_flag: flag };
}

/** 只需執行一次：建立每天 03:00 的觸發器（重複執行會先清掉舊的） */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyCheck').timeBased().atHour(3).everyDays(1).create();
  Logger.log('✅ 已建立每日 03:00 觸發器（dailyCheck）');
}

/**
 * 驗收用：塞三筆假合約（快到期／已過期未終止／已過期已終止），跑一次 dailyCheck，
 * 確認信有寄到、轉換有發生，再自動清掉假資料。
 */
function testRenewal() {
  const today = new Date();
  const d = function (offset) { const x = new Date(today); x.setDate(x.getDate() + offset); return fmtDate(x); };
  const mk = function (name, end, flag) {
    appendRow('contracts', {
      contract_id: 'TEST-' + name, token: genToken(), name: name,
      id_no: 'A100000001', phone: '0900', mail_addr: '測試',
      room: '二樓四人房', bed: '1號床位', room_type: '四人房', rent: 1500,
      deposit_type: '免押金', deposit_amt: 0,
      fee_mgmt: '出租人', fee_water: '出租人', fee_power: '出租人',
      term_start: d(-170), term_end: end, term_no: 1,
      status: '在住', terminate_flag: flag || '', notified_at: '',
      terms_ver: TERMS_VERSION, created_at: nowStr(),
    });
  };
  mk('測試快到期', d(20), '');
  mk('測試過期未終止', d(-1), '');
  mk('測試過期已終止', d(-1), '已通知終止 ' + d(-30));

  const n = dailyCheck();
  Logger.log('通知數：' + n + '（應為 3）');

  const after = readSheet('contracts');
  const conv = after.filter(function (r) { return r.name === '測試過期未終止'; })[0];
  Logger.log('過期未終止 → term_no=' + conv.term_no + '（應為 不定期）');
  const kept = after.filter(function (r) { return r.name === '測試過期已終止'; })[0];
  Logger.log('過期已終止 → term_no=' + kept.term_no + '（應仍為 1，等點交）');

  // 清掉假資料
  const sh = getSheet('contracts');
  after.filter(function (r) { return String(r.contract_id).indexOf('TEST-') === 0; })
       .map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
       .forEach(function (row) { sh.deleteRow(row); });
  Logger.log('假資料已清除。請到 ' + getSettings()['notify.email'] + ' 收信確認（主旨：宿舍合約：3 筆需要注意）');
}
