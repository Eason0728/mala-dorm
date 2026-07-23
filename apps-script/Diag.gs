/**
 * 診斷與收尾工具（TASK-00 用）
 */

/** 這支腳本是用哪個 Google 帳號在跑？那個雲端硬碟資料夾看得到嗎？ */
function diagWhoAmI() {
  Logger.log('執行帳號（effective）：' + Session.getEffectiveUser().getEmail());
  try {
    Logger.log('登入帳號（active）：' + Session.getActiveUser().getEmail());
  } catch (e) {
    Logger.log('登入帳號：無法取得（' + e.message + '）');
  }

  try {
    const f = DriveApp.getFolderById(SPIKE_FOLDER_ID);
    Logger.log('✅ 資料夾讀得到：' + f.getName());
    Logger.log('　 資料夾網址：' + f.getUrl());
    Logger.log('　 擁有者：' + f.getOwner().getEmail());
  } catch (e) {
    Logger.log('❌ 讀不到資料夾 ' + SPIKE_FOLDER_ID);
    Logger.log('　 原因：' + e.message);
    Logger.log('　 → 請確認上面那個執行帳號，對這個資料夾有沒有編輯權限。');
  }
}

/** 清掉上次失敗留在雲端硬碟根目錄的暫存 Doc */
function cleanupSpikeTemp() {
  const files = DriveApp.searchFiles('title contains "__spike_tmp_" and trashed = false');
  let n = 0;
  while (files.hasNext()) {
    const f = files.next();
    Logger.log('丟到垃圾桶：' + f.getName());
    f.setTrashed(true);
    n++;
  }
  Logger.log('共清掉 ' + n + ' 個暫存檔');
}

/**
 * 備援方案：不指定資料夾 ID，改成在執行帳號自己的雲端硬碟建一個
 * 「宿舍合約系統」資料夾來放 PDF。診斷完若確定帳號無法共用，就用這個。
 */
function diagEnsureOwnFolder() {
  const name = '宿舍合約系統';
  const it = DriveApp.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  Logger.log('可用資料夾：' + folder.getName() + '　ID：' + folder.getId());
  Logger.log('網址：' + folder.getUrl());
  return folder.getId();
}
