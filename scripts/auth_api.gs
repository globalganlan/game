/**
 * Auth API — 帳號系統 Apps Script 端
 *
 * 將此程式碼加入現有 Apps Script 專案的 doPost router。
 * 支援 actions：register-guest / login-guest / bind-account / login / change-name
 *
 * 需要的 Sheet：「players」
 * 欄位：playerId | guestToken | email | passwordHash | displayName | createdAt | lastLogin | isBound
 *
 * 部署方式：
 * 1. 開啟 Google Sheets → 擴充功能 → Apps Script
 * 2. 將此檔內容貼到 Code.gs（或新檔案）
 * 3. 在 doPost 的 action switch 中加入對應 case
 * 4. 重新部署 Web App（新版本）
 */

/* ════════════════════════════════════
   工具函式
   ════════════════════════════════════ */

/**
 * 取得或建立 players Sheet
 */
function getPlayersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('players');
  if (!sheet) {
    sheet = ss.insertSheet('players');
    sheet.getRange(1, 1, 1, 8).setValues([[
      'playerId', 'guestToken', 'email', 'passwordHash',
      'displayName', 'createdAt', 'lastLogin', 'isBound'
    ]]);
  }
  return sheet;
}

/**
 * 生成玩家 ID：P0001, P0002, ...
 */
function generatePlayerId_(sheet) {
  var lastRow = sheet.getLastRow();
  var nextNum = lastRow; // row 1 = header, so lastRow = count of players + 1 header → lastRow itself is the next number
  return 'P' + ('0000' + nextNum).slice(-4);
}

/**
 * SHA-256 hash（Apps Script 內建）
 */
function sha256_(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return raw.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * 依欄位值找行（回傳 1-based row number，0 = 找不到）
 */
function findRowByColumn_(sheet, colName, value) {
  if (sheet.getLastRow() <= 1) return 0;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = headers.indexOf(colName);
  if (colIdx === -1) return 0;
  var data = sheet.getRange(2, colIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(value)) return i + 2;
  }
  return 0;
}

/**
 * 讀取一行所有欄位為 object
 */
function readRow_(sheet, rowNum) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = values[i];
  }
  return obj;
}

/**
 * 寫入指定欄位
 */
function writeCell_(sheet, rowNum, colName, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = headers.indexOf(colName);
  if (colIdx === -1) return;
  sheet.getRange(rowNum, colIdx + 1).setValue(value);
}

/* ════════════════════════════════════
   API 處理函式（加入 doPost router）
   ════════════════════════════════════ */

/**
 * 訪客註冊
 * POST { action: "register-guest", guestToken: "uuid-v4" }
 * → { success, playerId, displayName }
 */
function handleRegisterGuest_(params) {
  var token = params.guestToken;
  if (!token) return { success: false, error: 'missing guestToken' };

  var sheet = getPlayersSheet_();

  // 檢查是否已存在
  var existing = findRowByColumn_(sheet, 'guestToken', token);
  if (existing > 0) {
    var row = readRow_(sheet, existing);
    return { success: true, playerId: row.playerId, displayName: row.displayName, alreadyExists: true };
  }

  // 建立新玩家
  var playerId = generatePlayerId_(sheet);
  var now = new Date().toISOString();
  var displayName = '倖存者#' + playerId.replace('P', '');

  sheet.appendRow([
    playerId, token, '', '', displayName, now, now, false
  ]);

  return { success: true, playerId: playerId, displayName: displayName, alreadyExists: false };
}

/**
 * 訪客登入（回訪）
 * POST { action: "login-guest", guestToken: "uuid-v4" }
 * → { success, playerId, displayName, isBound }
 */
function handleLoginGuest_(params) {
  var token = params.guestToken;
  if (!token) return { success: false, error: 'missing guestToken' };

  var sheet = getPlayersSheet_();
  var rowNum = findRowByColumn_(sheet, 'guestToken', token);
  if (rowNum === 0) {
    return { success: false, error: 'token_not_found' };
  }

  // 更新 lastLogin
  writeCell_(sheet, rowNum, 'lastLogin', new Date().toISOString());

  var row = readRow_(sheet, rowNum);
  return {
    success: true,
    playerId: row.playerId,
    displayName: row.displayName,
    isBound: row.isBound === true || row.isBound === 'TRUE'
  };
}

/**
 * 綁定帳密
 * POST { action: "bind-account", guestToken, email, password }
 * → { success, message }
 */
function handleBindAccount_(params) {
  var token = params.guestToken;
  var email = (params.email || '').trim().toLowerCase();
  var password = params.password;

  if (!token) return { success: false, error: 'missing guestToken' };
  if (!email) return { success: false, error: 'missing email' };
  if (!password || password.length < 6) return { success: false, error: 'password must be >= 6 chars' };

  var sheet = getPlayersSheet_();

  // 確認 token 存在
  var rowNum = findRowByColumn_(sheet, 'guestToken', token);
  if (rowNum === 0) return { success: false, error: 'token_not_found' };

  // 檢查 email 唯一性
  var emailRow = findRowByColumn_(sheet, 'email', email);
  if (emailRow > 0 && emailRow !== rowNum) {
    return { success: false, error: 'email_taken' };
  }

  // 寫入
  writeCell_(sheet, rowNum, 'email', email);
  writeCell_(sheet, rowNum, 'passwordHash', sha256_(password));
  writeCell_(sheet, rowNum, 'isBound', true);

  return { success: true, message: '帳號綁定成功' };
}

/**
 * 帳密登入
 * POST { action: "login", email, password }
 * → { success, playerId, guestToken, displayName }
 */
function handleLogin_(params) {
  var email = (params.email || '').trim().toLowerCase();
  var password = params.password;

  if (!email) return { success: false, error: 'missing email' };
  if (!password) return { success: false, error: 'missing password' };

  var sheet = getPlayersSheet_();
  var rowNum = findRowByColumn_(sheet, 'email', email);
  if (rowNum === 0) return { success: false, error: 'email_not_found' };

  var row = readRow_(sheet, rowNum);
  var hash = sha256_(password);
  if (hash !== row.passwordHash) {
    return { success: false, error: 'wrong_password' };
  }

  // 更新 lastLogin
  writeCell_(sheet, rowNum, 'lastLogin', new Date().toISOString());

  return {
    success: true,
    playerId: row.playerId,
    guestToken: row.guestToken,
    displayName: row.displayName
  };
}

/**
 * 修改暱稱
 * POST { action: "change-name", guestToken, newName }
 * → { success }
 */
function handleChangeName_(params) {
  var token = params.guestToken;
  var newName = (params.newName || '').trim();
  if (!token) return { success: false, error: 'missing guestToken' };
  if (!newName || newName.length < 1 || newName.length > 20) {
    return { success: false, error: 'name must be 1-20 chars' };
  }

  var sheet = getPlayersSheet_();
  var rowNum = findRowByColumn_(sheet, 'guestToken', token);
  if (rowNum === 0) return { success: false, error: 'token_not_found' };

  writeCell_(sheet, rowNum, 'displayName', newName);
  return { success: true };
}

/* ════════════════════════════════════
   doPost Router 擴展（加到現有的 switch-case）

   在既有 doPost function 的 action switch 中加入：

   case 'register-guest':
     return ContentService.createTextOutput(JSON.stringify(handleRegisterGuest_(params)))
       .setMimeType(ContentService.MimeType.JSON);
   case 'login-guest':
     return ContentService.createTextOutput(JSON.stringify(handleLoginGuest_(params)))
       .setMimeType(ContentService.MimeType.JSON);
   case 'bind-account':
     return ContentService.createTextOutput(JSON.stringify(handleBindAccount_(params)))
       .setMimeType(ContentService.MimeType.JSON);
   case 'login':
     return ContentService.createTextOutput(JSON.stringify(handleLogin_(params)))
       .setMimeType(ContentService.MimeType.JSON);
   case 'change-name':
     return ContentService.createTextOutput(JSON.stringify(handleChangeName_(params)))
       .setMimeType(ContentService.MimeType.JSON);

   ════════════════════════════════════ */
