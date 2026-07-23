/**
 * TASK-01　建立試算表與四張工作表（只需執行一次）
 *
 * 執行 setupCreateSpreadsheet() 後，試算表 ID 會存進 Script Properties，
 * 之後所有程式都靠 getSS() 取得，不用把 ID 寫死在程式碼裡。
 */

const PROP_SS_ID = 'DORM_SS_ID';
const DRIVE_FOLDER_ID = '1l_6zoL1eOkc4Rpby-MlZFrMor8Ba7wZH';

const SHEET_DEFS = {
  contracts: [
    'contract_id', 'token', 'name', 'id_no', 'phone', 'mail_addr',
    'room', 'bed', 'room_type', 'rent',
    'deposit_type', 'deposit_amt',
    'fee_mgmt', 'fee_water', 'fee_power',
    'term_start', 'term_end', 'term_no',
    'status', 'terminate_flag', 'notified_at',
    'equip_json', 'signed_at', 'signed_ip', 'signed_ua',
    'sign_img_id', 'pdf_id', 'terms_ver', 'created_at',
  ],
  handovers: [
    'handover_id', 'contract_id', 'token', 'items_json',
    'need_cleaning', 'compensation_total',
    'signed_at', 'signed_ip', 'signed_ua', 'sign_img_id', 'pdf_id', 'created_at',
  ],
  settings: ['key', 'value', 'note'],
  audit_log: ['ts', 'event', 'ref_id', 'ip', 'ua', 'detail'],
};

const DEFAULT_SETTINGS = [
  ['rate.單人房', 3500, '同仁每月負擔（不印在合約條文上，只帶入金額）'],
  ['rate.雙人房', 2000, ''],
  ['rate.四人房', 1500, ''],
  ['price.書桌', 2000, '賠償單價，來源：鼎兆元員工宿舍配置表'],
  ['price.椅子', 1000, 'Eason 2026-07-23 提供'],
  ['price.床架', 3500, ''],
  ['price.床墊', 3500, ''],
  ['price.衣櫃', 4000, ''],
  ['price.房間鑰匙', 100, 'Eason 2026-07-23 提供'],
  ['price.大門遙控器', 800, 'Eason 2026-07-23 提供'],
  ['fee.cleaning', 3000, '退房未復原或留private物品之清潔費'],
  ['lessor.name', '鼎兆元股份有限公司', ''],
  ['lessor.taxid', '83575678', 'Eason 2026-07-23 提供'],
  ['lessor.addr', '新竹市東區金山七街122號2樓', '營業登記地址'],
  ['lessor.phone', '03-5638866', ''],
  ['property.addr', '新竹市光復路一段435號', '租賃標的門牌，固定'],
  ['term.months', 6, '每期租期月數'],
  ['renew.notice_days', 30, '到期前幾天寄提醒信'],
  ['fee.market_share', 2500, '門市每月負擔（僅內部作業用，不印在文件上）'],
  ['drive.folder_id', DRIVE_FOLDER_ID, 'PDF 存放資料夾'],
  ['notify.email', 'madesiaosinla@gmail.com', '到期提醒收件人'],
  ['terms.version', '2026-07-23-v2.2', '合約條文版本'],
  ['site.base_url', '', '前端 GitHub Pages 網址，Phase 2 填'],
  ['admin.pass', '', '⚠️ 待設定：管理端通行碼（執行 setupAdminPass 設定）'],
];

function setupCreateSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty(PROP_SS_ID);
  if (existing) {
    Logger.log('⚠️ 試算表已建立過：' + SpreadsheetApp.openById(existing).getUrl());
    Logger.log('　 要重建請先手動清掉 Script Properties 的 ' + PROP_SS_ID);
    return existing;
  }

  const ss = SpreadsheetApp.create('宿舍合約系統');
  Object.keys(SHEET_DEFS).forEach(function (name, i) {
    const sh = i === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name);
    const headers = SHEET_DEFS[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#f0ece8');
    sh.setFrozenRows(1);
  });

  const st = ss.getSheetByName('settings');
  st.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
  st.autoResizeColumns(1, 3);

  // 搬進指定資料夾，讓試算表與 PDF 放在一起
  try {
    const file = DriveApp.getFileById(ss.getId());
    DriveApp.getFolderById(DRIVE_FOLDER_ID).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  } catch (e) {
    Logger.log('（搬資料夾失敗，試算表留在雲端硬碟根目錄：' + e.message + '）');
  }

  props.setProperty(PROP_SS_ID, ss.getId());
  Logger.log('✅ 試算表建好了：' + ss.getUrl());
  Logger.log('　 四張工作表：' + Object.keys(SHEET_DEFS).join('／'));
  Logger.log('　 settings 已填 ' + DEFAULT_SETTINGS.length + ' 筆預設值');
  Logger.log('　 ⚠️ 有三筆出租人資料（統編／地址／電話）留空，要補。');
  return ss.getId();
}

/** 補寫出租人資料（試算表已建立過才需要跑這支） */
function setupLessorInfo() {
  setSetting('lessor.name', '鼎兆元股份有限公司');
  setSetting('lessor.taxid', '83575678');
  setSetting('lessor.addr', '新竹市東區金山七街122號2樓');
  setSetting('lessor.phone', '03-5638866');
  const s = getSettings();
  Logger.log('✅ 出租人資料已寫入：');
  ['lessor.name', 'lessor.taxid', 'lessor.addr', 'lessor.phone'].forEach(function (k) {
    Logger.log('　 ' + k + ' = ' + s[k]);
  });
}

/** 設定管理端通行碼（存進 settings，不寫在前端） */
function setupAdminPass() {
  const pass = 'mala' + Math.floor(Math.random() * 900000 + 100000);
  setSetting('admin.pass', pass);
  Logger.log('✅ 管理端通行碼：' + pass);
  Logger.log('　 要改成自己好記的，直接改 settings 工作表的 admin.pass 那一列。');
}
