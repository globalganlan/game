/**
 * Google Sheets 通用 CRUD API — GlobalGanLan 專案
 *
 * 功能：列出所有表、讀取任意表、創建新表、更新表資料、刪除表
 *
 * 部署方式：
 * 1. 開啟 Google Sheets → 擴充功能 → Apps Script
 * 2. 用此檔案內容 **完全取代** Code.gs
 * 3. 部署 → 新增部署 → 網頁應用程式
 *    - 說明：Sheet CRUD API v2
 *    - 執行身分：我自己
 *    - 誰可以存取：所有人
 * 4. 複製部署 URL → 同時作為 GET 和 POST endpoint
 *
 * ═══════════════════════════════════════════════════════
 * GET 端點
 * ═══════════════════════════════════════════════════════
 *
 * ● 列出所有表名
 *   GET ?action=listSheets
 *   → { sheets: ["heroes", "skill_templates", ...] }
 *
 * ● 讀取指定表（全部資料）
 *   GET ?action=readSheet&sheet=heroes
 *   → { sheet: "heroes", headers: [...], data: [...], count: 14 }
 *
 * ● 讀取指定表（不帶 action，向下相容舊 GET）
 *   GET （無參數）
 *   → { value: [...], Count: 14 }（與舊格式相同，讀 heroes）
 *
 * ═══════════════════════════════════════════════════════
 * POST 端點 — JSON body
 * ═══════════════════════════════════════════════════════
 *
 * ● 列出所有表
 *   { "action": "listSheets" }
 *
 * ● 讀取指定表
 *   { "action": "readSheet", "sheet": "heroes" }
 *
 * ● 建立新表
 *   { "action": "createSheet", "sheet": "skill_templates", "headers": ["SkillID","Name","Type","BaseDmg"] }
 *   → { success: true, created: "skill_templates" }
 *
 * ● 建立新表 + 同時寫入資料
 *   { "action": "createSheet", "sheet": "items",
 *     "headers": ["ItemID","Name","Rarity"],
 *     "data": [ {"ItemID":1,"Name":"破舊長劍","Rarity":1} ] }
 *
 * ● 更新/寫入表資料（通用版）
 *   { "action": "updateSheet", "sheet": "heroes", "keyColumn": "HeroID",
 *     "newColumns": ["DEF","CritRate"],
 *     "data": [ {"HeroID":1,"DEF":15,"CritRate":5} ] }
 *   → { success: true, updated: 1 }
 *   - keyColumn: 用來定位行的主鍵欄位（預設 "HeroID"）
 *   - newColumns: 自動建立不存在的欄位（可選）
 *   - data: 要更新的行陣列
 *
 * ● 向表追加資料（不需要 keyColumn）
 *   { "action": "appendRows", "sheet": "battle_log",
 *     "data": [ {"Time":"2026-02-26","Result":"win"} ] }
 *   → { success: true, appended: 1 }
 *
 * ● 刪除表
 *   { "action": "deleteSheet", "sheet": "old_table" }
 *   → { success: true, deleted: "old_table" }
 *
 * ● 重新命名表
 *   { "action": "renameSheet", "sheet": "old_name", "newName": "new_name" }
 *   → { success: true, renamed: "old_name → new_name" }
 *
 * ● 刪除表中特定行
 *   { "action": "deleteRows", "sheet": "heroes", "keyColumn": "HeroID", "keys": [15, 16] }
 *   → { success: true, deleted: 2 }
 *
 * ● 清空表資料（保留表頭）
 *   { "action": "clearSheet", "sheet": "battle_log" }
 *   → { success: true, cleared: "battle_log" }
 *
 * ● 向下相容舊 API
 *   { "action": "updateHeroes", "newColumns": [...], "data": [...] }
 *   → 等同 updateSheet + sheet=heroes + keyColumn=HeroID
 */

// ─── GET ────────────────────────────────────────────────
function doGet(e) {
  var params = e ? e.parameter : {};
  var action = params.action || '';

  try {
    var result;
    switch (action) {
      case 'listSheets':
        result = handleListSheets();
        break;
      case 'readSheet':
        result = handleReadSheet(params.sheet);
        break;
      default:
        // 向下相容：無 action 時回傳 heroes
        result = handleReadSheetLegacy();
        break;
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ─── POST ───────────────────────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';
    var result;

    switch (action) {
      case 'listSheets':
        result = handleListSheets();
        break;
      case 'readSheet':
        result = handleReadSheet(body.sheet);
        break;
      case 'createSheet':
        result = handleCreateSheet(body.sheet, body.headers, body.data);
        break;
      case 'updateSheet':
        result = handleUpdateSheet(body.sheet, body.keyColumn, body.newColumns, body.data);
        break;
      case 'appendRows':
        result = handleAppendRows(body.sheet, body.data);
        break;
      case 'deleteSheet':
        result = handleDeleteSheet(body.sheet);
        break;
      case 'renameSheet':
        result = handleRenameSheet(body.sheet, body.newName);
        break;
      case 'deleteRows':
        result = handleDeleteRows(body.sheet, body.keyColumn, body.keys);
        break;
      case 'clearSheet':
        result = handleClearSheet(body.sheet);
        break;
      // ── 向下相容 ──
      case 'updateHeroes':
        result = handleUpdateSheet('heroes', 'HeroID', body.newColumns, body.data);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════
// Handler 實作
// ═══════════════════════════════════════════════════════

/** 列出所有工作表名稱 */
function handleListSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets().map(function(s) {
    return {
      name: s.getName(),
      rows: s.getLastRow(),
      cols: s.getLastColumn()
    };
  });
  return { sheets: sheets };
}

/** 讀取指定工作表（新格式） */
function handleReadSheet(sheetName) {
  if (!sheetName) throw new Error('Missing required parameter: sheet');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    return { sheet: sheetName, headers: [], data: [], count: 0 };
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (lastRow <= 1) {
    return { sheet: sheetName, headers: headers, data: [], count: 0 };
  }

  var rawData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var data = rawData.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      obj[h] = row[i];
    });
    return obj;
  });

  return { sheet: sheetName, headers: headers, data: data, count: data.length };
}

/** 向下相容舊 GET（讀 heroes） */
function handleReadSheetLegacy() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('heroes') || ss.getSheets()[0];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow <= 1) return { value: [], Count: 0 };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var result = data.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
  return { value: result, Count: result.length };
}

/** 建立新工作表 */
function handleCreateSheet(sheetName, headers, data) {
  if (!sheetName) throw new Error('Missing required parameter: sheet');
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 檢查是否已存在
  if (ss.getSheetByName(sheetName)) {
    throw new Error('Sheet already exists: ' + sheetName);
  }

  var sheet = ss.insertSheet(sheetName);

  // 寫入表頭
  if (headers && headers.length > 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // 寫入初始資料
  var rowCount = 0;
  if (data && data.length > 0 && headers && headers.length > 0) {
    var rows = data.map(function(obj) {
      return headers.map(function(h) {
        return obj[h] !== undefined ? obj[h] : '';
      });
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    rowCount = rows.length;
  }

  return { success: true, created: sheetName, rows: rowCount };
}

/** 更新工作表資料（通用版） */
function handleUpdateSheet(sheetName, keyColumn, newColumns, data) {
  sheetName = sheetName || 'heroes';
  keyColumn = keyColumn || 'HeroID';
  if (!data || data.length === 0) throw new Error('Missing required parameter: data');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // 新增不存在的欄位
  if (newColumns && newColumns.length > 0) {
    newColumns.forEach(function(col) {
      if (headers.indexOf(col) === -1) {
        var newCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, newCol).setValue(col);
        headers.push(col);
      }
    });
  }

  // 也把 data 裡出現但 headers 沒有的欄位自動加上
  data.forEach(function(row) {
    Object.keys(row).forEach(function(key) {
      if (headers.indexOf(key) === -1) {
        var newCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, newCol).setValue(key);
        headers.push(key);
      }
    });
  });

  // 重新讀取完整表頭
  var fullHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var keyIdx = fullHeaders.indexOf(keyColumn);
  if (keyIdx === -1) throw new Error('Key column not found: ' + keyColumn);

  // 讀取所有資料行
  var lastRow = sheet.getLastRow();
  var allData = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues()
    : [];

  var updatedCount = 0;
  data.forEach(function(rowData) {
    var keyValue = rowData[keyColumn];
    if (keyValue === undefined) return;

    // 找到匹配的行
    var foundRow = -1;
    for (var r = 0; r < allData.length; r++) {
      if (String(allData[r][keyIdx]) === String(keyValue)) {
        foundRow = r;
        break;
      }
    }

    if (foundRow !== -1) {
      // 更新現有行
      Object.keys(rowData).forEach(function(field) {
        if (field === keyColumn) return;
        var colIdx = fullHeaders.indexOf(field);
        if (colIdx !== -1) {
          sheet.getRange(foundRow + 2, colIdx + 1).setValue(rowData[field]);
        }
      });
      updatedCount++;
    } else {
      // key 不存在 → 自動追加新行
      var newRow = [];
      fullHeaders.forEach(function(h) {
        newRow.push(rowData[h] !== undefined ? rowData[h] : '');
      });
      sheet.appendRow(newRow);
      updatedCount++;
    }
  });

  return { success: true, updated: updatedCount };
}

/** 追加資料到表末 */
function handleAppendRows(sheetName, data) {
  if (!sheetName) throw new Error('Missing required parameter: sheet');
  if (!data || data.length === 0) throw new Error('Missing required parameter: data');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    : [];

  // 如果表是空的，用 data 的 keys 作為 headers
  if (headers.length === 0 || (headers.length === 1 && headers[0] === '')) {
    var allKeys = {};
    data.forEach(function(row) {
      Object.keys(row).forEach(function(k) { allKeys[k] = true; });
    });
    headers = Object.keys(allKeys);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // 追加
  var rows = data.map(function(obj) {
    return headers.map(function(h) {
      return obj[h] !== undefined ? obj[h] : '';
    });
  });

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);

  return { success: true, appended: rows.length };
}

/** 刪除工作表 */
function handleDeleteSheet(sheetName) {
  if (!sheetName) throw new Error('Missing required parameter: sheet');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  // 安全檢查：不能刪除最後一個表
  if (ss.getSheets().length <= 1) {
    throw new Error('Cannot delete the only remaining sheet');
  }

  ss.deleteSheet(sheet);
  return { success: true, deleted: sheetName };
}

/** 重新命名工作表 */
function handleRenameSheet(sheetName, newName) {
  if (!sheetName) throw new Error('Missing required parameter: sheet');
  if (!newName) throw new Error('Missing required parameter: newName');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  if (ss.getSheetByName(newName)) throw new Error('Sheet already exists: ' + newName);

  sheet.setName(newName);
  return { success: true, renamed: sheetName + ' → ' + newName };
}

/** 刪除表中特定行 */
function handleDeleteRows(sheetName, keyColumn, keys) {
  if (!sheetName) throw new Error('Missing required parameter: sheet');
  if (!keyColumn) throw new Error('Missing required parameter: keyColumn');
  if (!keys || keys.length === 0) throw new Error('Missing required parameter: keys');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var keyIdx = headers.indexOf(keyColumn);
  if (keyIdx === -1) throw new Error('Key column not found: ' + keyColumn);

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, deleted: 0 };

  var allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var keysStr = keys.map(String);

  // 從下往上刪，避免行號移位
  var deletedCount = 0;
  for (var r = allData.length - 1; r >= 0; r--) {
    if (keysStr.indexOf(String(allData[r][keyIdx])) !== -1) {
      sheet.deleteRow(r + 2);
      deletedCount++;
    }
  }

  return { success: true, deleted: deletedCount };
}

/** 清空表資料（保留表頭） */
function handleClearSheet(sheetName) {
  if (!sheetName) throw new Error('Missing required parameter: sheet');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  return { success: true, cleared: sheetName };
}

// ─── Utility ────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
