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

// ═══════════════════════════════════════════════════════
// CacheService 快取層
// ═══════════════════════════════════════════════════════
//
// GAS CacheService 限制：
//   - 每個 key-value 最大 100 KB
//   - ScriptCache 全使用者共用（適合全域配表）
//   - 最長 TTL = 21600 秒（6 小時）
//
// 快取策略分 3 級：
//   A. 全域配表（heroes, skill_templates, hero_skills, element_matrix,
//      item_definitions）— 所有玩家相同、極少變動 → TTL 6h
//   B. 共用運算結果（loadHeroPool_）— 衍生自 heroes 表 → TTL 6h
//   C. 每用戶映射（resolvePlayerId_）— token→playerId → TTL 6h
//
// 寫入操作會自動清除相關快取 key，確保下次讀取拿到最新值。

var CACHE_TTL_CONFIG_ = 21600;   // 6 小時（全域配表）
var CACHE_TTL_PLAYER_ = 21600;   // 6 小時（token→playerId，不會變）

// 可快取的全域配表白名單
var CACHEABLE_SHEETS_ = ['heroes', 'skill_templates', 'hero_skills', 'element_matrix', 'item_definitions'];

/**
 * 從 ScriptCache 取值，若命中直接回傳 parsed JSON。
 * 支援大資料分片：超過 90KB 時自動切成 chunk:key:0, chunk:key:1, …
 * @param {string} key
 * @returns {*|null} parsed value or null if miss
 */
function cacheGet_(key) {
  try {
    var c = CacheService.getScriptCache();
    var meta = c.get('meta:' + key);
    if (meta) {
      // 分片模式
      var chunks = Number(meta);
      var parts = [];
      for (var i = 0; i < chunks; i++) {
        var part = c.get('chunk:' + key + ':' + i);
        if (part === null) return null;  // 任一 chunk miss → 快取失效
        parts.push(part);
      }
      return JSON.parse(parts.join(''));
    }
    var raw = c.get(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;  // 解析失敗當作 miss
  }
}

/**
 * 寫入 ScriptCache。若 JSON 字串 > 90KB 則自動分片。
 * @param {string} key
 * @param {*} value     — 會被 JSON.stringify
 * @param {number} ttl  — 秒（max 21600）
 */
function cacheSet_(key, value, ttl) {
  try {
    var c = CacheService.getScriptCache();
    var json = JSON.stringify(value);
    var CHUNK_SIZE = 90000; // 90 KB 上限留點餘裕
    if (json.length <= CHUNK_SIZE) {
      // 確保清掉舊分片 meta（如果之前是分片存的）
      c.remove('meta:' + key);
      c.put(key, json, ttl);
    } else {
      // 分片寫入
      var chunks = Math.ceil(json.length / CHUNK_SIZE);
      var pairs = {};
      for (var i = 0; i < chunks; i++) {
        pairs['chunk:' + key + ':' + i] = json.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      }
      c.putAll(pairs, ttl);
      c.put('meta:' + key, String(chunks), ttl);
      c.remove(key); // 清掉可能的舊非分片值
    }
  } catch (e) {
    // 快取寫入失敗不影響主流程
  }
}

/**
 * 刪除快取 key（含分片清理）
 * @param {string} key
 */
function cacheRemove_(key) {
  try {
    var c = CacheService.getScriptCache();
    var meta = c.get('meta:' + key);
    if (meta) {
      var chunks = Number(meta);
      var keys = ['meta:' + key];
      for (var i = 0; i < chunks; i++) keys.push('chunk:' + key + ':' + i);
      c.removeAll(keys);
    }
    c.remove(key);
  } catch (e) { /* ignore */ }
}

/**
 * 清除某張表相關的所有快取
 * @param {string} sheetName
 */
function invalidateSheetCache_(sheetName) {
  cacheRemove_('sheet:' + sheetName);
  // heroes 表額外清 loadHeroPool_ 快取
  if (sheetName === 'heroes') {
    cacheRemove_('heroPool');
  }
  // item_definitions 表額外清 itemDefs 快取
  if (sheetName === 'item_definitions') {
    cacheRemove_('itemDefs');
  }
}

/**
 * 清除所有已知快取 key（管理員用）
 */
function invalidateAllCache_() {
  var keys = ['heroPool', 'itemDefs'];
  for (var i = 0; i < CACHEABLE_SHEETS_.length; i++) {
    keys.push('sheet:' + CACHEABLE_SHEETS_[i]);
  }
  // 也嘗試清除所有可能的 player token 快取
  // （無法列舉全部，但手動全清時效果等同 TTL 到期）
  for (var j = 0; j < keys.length; j++) {
    cacheRemove_(keys[j]);
  }
}

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
        result = handleCreateSheet(body.sheet, body.headers, body.data, body.textColumns);
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
      // ── Auth ──
      case 'register-guest':
        result = handleRegisterGuest_(body);
        break;
      case 'login-guest':
        result = handleLoginGuest_(body);
        break;
      case 'bind-account':
        result = handleBindAccount_(body);
        break;
      case 'login':
        result = handleLogin_(body);
        break;
      case 'change-name':
        result = handleChangeName_(body);
        break;
      case 'change-password':
        result = handleChangePassword_(body);
        break;
      // ── Save System ──
      case 'load-save':
        result = handleLoadSave_(body);
        break;
      case 'init-save':
        result = handleInitSave_(body);
        break;
      case 'save-progress':
        result = handleSaveProgress_(body);
        break;
      case 'save-formation':
        result = handleSaveFormation_(body);
        break;
      case 'add-hero':
        result = handleAddHero_(body);
        break;
      case 'collect-resources':
        result = handleCollectResources_(body);
        break;
      // ── Inventory ──
      case 'load-item-definitions':
        result = handleLoadItemDefinitions_();
        break;
      case 'load-inventory':
        result = handleLoadInventory_(body);
        break;
      case 'add-items':
        result = handleAddItems_(body);
        break;
      case 'remove-items':
        result = handleRemoveItems_(body);
        break;
      case 'sell-items':
        result = handleSellItems_(body);
        break;
      case 'use-item':
        result = handleUseItem_(body);
        break;
      case 'equip-item':
        result = handleEquipItem_(body);
        break;
      case 'unequip-item':
        result = handleUnequipItem_(body);
        break;
      case 'lock-equipment':
        result = handleLockEquipment_(body);
        break;
      case 'expand-inventory':
        result = handleExpandInventory_(body);
        break;
      // ── Progression ──
      case 'upgrade-hero':
        result = executeWithIdempotency_(body.opId, resolvePlayerId_(body.guestToken), 'upgrade-hero', function() {
          return handleUpgradeHero_(body);
        });
        break;
      case 'ascend-hero':
        result = executeWithIdempotency_(body.opId, resolvePlayerId_(body.guestToken), 'ascend-hero', function() {
          return handleAscendHero_(body);
        });
        break;
      case 'star-up-hero':
        result = executeWithIdempotency_(body.opId, resolvePlayerId_(body.guestToken), 'star-up-hero', function() {
          return handleStarUpHero_(body);
        });
        break;
      case 'enhance-equipment':
        result = handleEnhanceEquipment_(body);
        break;
      case 'forge-equipment':
        result = handleForgeEquipment_(body);
        break;
      case 'dismantle-equipment':
        result = handleDismantleEquipment_(body);
        break;
      // ── Stage ──
      case 'complete-stage':
        result = handleCompleteStage_(body);
        break;
      case 'complete-tower':
        result = handleCompleteTower_(body);
        break;
      case 'complete-daily':
        result = handleCompleteDaily_(body);
        break;
      // ── Gacha ──
      case 'gacha-pull':
        result = handleGachaPull_(body);
        break;
      case 'gacha-pool-status':
        result = handleGachaPoolStatus_(body);
        break;
      case 'refill-pool':
        result = handleRefillPool_(body);
        break;
      case 'reset-gacha-pool':
        result = handleResetGachaPool_(body);
        break;
      // ── Mailbox ──
      case 'load-mail':
        result = handleLoadMail_(body);
        break;
      case 'read-mail':
        result = handleReadMail_(body);
        break;
      case 'claim-mail-reward':
        result = handleClaimMailReward_(body);
        break;
      case 'claim-all-mail':
        result = handleClaimAllMail_(body);
        break;
      case 'delete-mail':
        result = handleDeleteMail_(body);
        break;
      case 'delete-all-read':
        result = handleDeleteAllRead_(body);
        break;
      case 'send-mail':
        result = handleSendMail_(body);
        break;
      // ── Reward ──
      case 'claim-pwa-reward':
        result = handleClaimPwaReward_(body);
        break;
      // ── 向下相容 ──
      case 'updateHeroes':
        result = handleUpdateSheet('heroes', 'HeroID', body.newColumns, body.data);
        break;
      // ── Optimistic Queue ──
      case 'reconcile-pending':
        result = handleReconcilePending_(body);
        break;
      case 'check-op':
        result = handleCheckOp_(body);
        break;
      case 'delete-column':
        result = handleDeleteColumn_(body.sheet, body.column);
        break;
      // ── Battle ──
      case 'run-battle':
        result = handleRunBattle_(body);
        break;
      // ── Cache ──
      case 'invalidate-cache':
        invalidateAllCache_();
        result = { success: true, message: 'All cache invalidated' };
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

/** 讀取指定工作表（新格式，含快取） */
function handleReadSheet(sheetName) {
  if (!sheetName) throw new Error('Missing required parameter: sheet');

  // 全域配表走快取
  if (CACHEABLE_SHEETS_.indexOf(sheetName) !== -1) {
    var cached = cacheGet_('sheet:' + sheetName);
    if (cached) {
      cached._cached = true;  // 標記來源
      return cached;
    }
  }

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

  var result = { sheet: sheetName, headers: headers, data: data, count: data.length };

  // 全域配表寫入快取
  if (CACHEABLE_SHEETS_.indexOf(sheetName) !== -1) {
    cacheSet_('sheet:' + sheetName, result, CACHE_TTL_CONFIG_);
  }

  return result;
}

/** 向下相容舊 GET（讀 heroes，含快取） */
function handleReadSheetLegacy() {
  // 嘗試從 heroes 的快取中取
  var cached = cacheGet_('sheet:heroes');
  if (cached && cached.data) {
    return { value: cached.data, Count: cached.data.length, _cached: true };
  }

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

  // 同時填充 readSheet 格式的快取（供後續 readSheet('heroes') 使用）
  cacheSet_('sheet:heroes', { sheet: 'heroes', headers: headers, data: result, count: result.length }, CACHE_TTL_CONFIG_);

  return { value: result, Count: result.length };
}

/** 建立新工作表 */
function handleCreateSheet(sheetName, headers, data, textColumns) {
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

  // 指定欄位設為純文字格式（防止 "1-1" 被自動轉成日期）
  if (textColumns && textColumns.length > 0 && headers && headers.length > 0) {
    var maxRows = Math.max((data ? data.length : 0) + 10, 100);
    textColumns.forEach(function(colName) {
      var colIdx = headers.indexOf(colName);
      if (colIdx >= 0) {
        sheet.getRange(2, colIdx + 1, maxRows, 1).setNumberFormat('@');
      }
    });
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

  invalidateSheetCache_(sheetName);
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

  invalidateSheetCache_(sheetName);
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

  invalidateSheetCache_(sheetName);
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
  invalidateSheetCache_(sheetName);
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
  invalidateSheetCache_(sheetName);
  invalidateSheetCache_(newName);
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

  invalidateSheetCache_(sheetName);
  return { success: true, deleted: deletedCount };
}

/** 刪除指定欄位（整欄，含表頭） */
function handleDeleteColumn_(sheetName, colName) {
  if (!sheetName) throw new Error('Missing required parameter: sheet');
  if (!colName) throw new Error('Missing required parameter: column');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headers.indexOf(colName);
  if (idx === -1) return { success: true, message: 'Column not found, nothing to delete: ' + colName };
  sheet.deleteColumn(idx + 1);
  invalidateSheetCache_(sheetName);
  return { success: true, deleted: colName };
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

  invalidateSheetCache_(sheetName);
  return { success: true, cleared: sheetName };
}

// ─── Utility ────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════
// Auth 系統
// ═══════════════════════════════════════════════════════

/** 取得或建立 players Sheet */
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

/** 生成玩家 ID：P0001, P0002, ... */
function generatePlayerId_(sheet) {
  var lastRow = sheet.getLastRow();
  var nextNum = lastRow;
  return 'P' + ('0000' + nextNum).slice(-4);
}

/** SHA-256 hash */
function sha256_(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return raw.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/** 依欄位值找行（回傳 1-based row number，0 = 找不到） */
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

/** 讀取一行所有欄位為 object */
function readRow_(sheet, rowNum) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = values[i];
  }
  return obj;
}

/** 寫入指定欄位 */
function writeCell_(sheet, rowNum, colName, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = headers.indexOf(colName);
  if (colIdx === -1) return;
  var cell = sheet.getRange(rowNum, colIdx + 1);
  // 含 "-" 的短字串（如 "1-1"）先設純文字格式，防止被當日期
  if (typeof value === 'string' && /^\d+-\d+$/.test(value)) {
    cell.setNumberFormat('@');
  }
  cell.setValue(value);
}

/** 訪客註冊 */
function handleRegisterGuest_(params) {
  var token = params.guestToken;
  if (!token) return { success: false, error: 'missing guestToken' };

  var sheet = getPlayersSheet_();
  var existing = findRowByColumn_(sheet, 'guestToken', token);
  if (existing > 0) {
    var row = readRow_(sheet, existing);
    return { success: true, playerId: row.playerId, displayName: row.displayName, alreadyExists: true };
  }

  var playerId = generatePlayerId_(sheet);
  var now = new Date().toISOString();
  var displayName = '倖存者#' + playerId.replace('P', '');

  sheet.appendRow([
    playerId, token, '', '', displayName, now, now, false
  ]);

  // ── 新用戶歡迎禮包信件 ──
  try {
    handleSendMail_({
      targetPlayerIds: [playerId],
      title: '🎉 歡迎來到全球感染！',
      body: '感謝加入末日生存之旅！這是你的新手禮包，祝你在感染的世界中存活下來！',
      rewards: [
        { itemId: 'diamond', quantity: 300 },
        { itemId: 'gold', quantity: 10000 },
        { itemId: 'exp_core_m', quantity: 5 },
        { itemId: 'exp_core_l', quantity: 2 }
      ],
      expiresAt: ''
    });
  } catch (e) {
    Logger.log('Welcome mail failed for ' + playerId + ': ' + e.message);
  }

  return { success: true, playerId: playerId, displayName: displayName, alreadyExists: false };
}

/** 訪客登入（回訪） */
function handleLoginGuest_(params) {
  var token = params.guestToken;
  if (!token) return { success: false, error: 'missing guestToken' };

  var sheet = getPlayersSheet_();
  var rowNum = findRowByColumn_(sheet, 'guestToken', token);
  if (rowNum === 0) return { success: false, error: 'token_not_found' };

  writeCell_(sheet, rowNum, 'lastLogin', new Date().toISOString());
  var row = readRow_(sheet, rowNum);
  return {
    success: true,
    playerId: row.playerId,
    displayName: row.displayName,
    isBound: row.isBound === true || row.isBound === 'TRUE'
  };
}

/** 綁定帳密 */
function handleBindAccount_(params) {
  var token = params.guestToken;
  var email = (params.email || '').trim().toLowerCase();
  var password = params.password;

  if (!token) return { success: false, error: 'missing guestToken' };
  if (!email) return { success: false, error: 'missing email' };
  if (!password || password.length < 6) return { success: false, error: 'password must be >= 6 chars' };

  var sheet = getPlayersSheet_();
  var rowNum = findRowByColumn_(sheet, 'guestToken', token);
  if (rowNum === 0) return { success: false, error: 'token_not_found' };

  var emailRow = findRowByColumn_(sheet, 'email', email);
  if (emailRow > 0 && emailRow !== rowNum) return { success: false, error: 'email_taken' };

  // 檢查是否為首次綁定（從未綁定→已綁定）
  var currentRow = readRow_(sheet, rowNum);
  var wasBound = currentRow.isBound === true || currentRow.isBound === 'TRUE';

  writeCell_(sheet, rowNum, 'email', email);
  writeCell_(sheet, rowNum, 'passwordHash', sha256_(password));
  writeCell_(sheet, rowNum, 'isBound', true);

  // ── 首次綁定獎勵信件 ──
  if (!wasBound) {
    try {
      handleSendMail_({
        targetPlayerIds: [currentRow.playerId],
        title: '🔗 帳號綁定獎勵',
        body: '恭喜完成帳號綁定！您的帳號現在更安全了，可以跨裝置登入保留所有進度。這是您的綁定獎勵！',
        rewards: [
          { itemId: 'diamond', quantity: 200 },
          { itemId: 'gold', quantity: 5000 }
        ],
        expiresAt: ''
      });
    } catch (e) {
      Logger.log('Bind reward mail failed for ' + currentRow.playerId + ': ' + e.message);
    }
  }

  return { success: true, message: '帳號綁定成功' };
}

/** 帳密登入 */
function handleLogin_(params) {
  var email = (params.email || '').trim().toLowerCase();
  var password = params.password;

  if (!email) return { success: false, error: 'missing email' };
  if (!password) return { success: false, error: 'missing password' };

  var sheet = getPlayersSheet_();
  var rowNum = findRowByColumn_(sheet, 'email', email);
  if (rowNum === 0) return { success: false, error: 'email_not_found' };

  var row = readRow_(sheet, rowNum);
  if (sha256_(password) !== row.passwordHash) return { success: false, error: 'wrong_password' };

  writeCell_(sheet, rowNum, 'lastLogin', new Date().toISOString());
  return {
    success: true,
    playerId: row.playerId,
    guestToken: row.guestToken,
    displayName: row.displayName
  };
}

/** 修改暱稱 */
function handleChangeName_(params) {
  var token = params.guestToken;
  var newName = (params.newName || '').trim();
  if (!token) return { success: false, error: 'missing guestToken' };
  if (!newName || newName.length < 1 || newName.length > 20) return { success: false, error: 'name must be 1-20 chars' };

  var sheet = getPlayersSheet_();
  var rowNum = findRowByColumn_(sheet, 'guestToken', token);
  if (rowNum === 0) return { success: false, error: 'token_not_found' };

  writeCell_(sheet, rowNum, 'displayName', newName);
  return { success: true };
}

/** 修改密碼（必須已綁定 email） */
function handleChangePassword_(params) {
  var token = params.guestToken;
  var oldPassword = params.oldPassword;
  var newPassword = params.newPassword;

  if (!token) return { success: false, error: 'missing guestToken' };
  if (!oldPassword) return { success: false, error: 'missing oldPassword' };
  if (!newPassword || newPassword.length < 6) return { success: false, error: 'new password must be >= 6 chars' };

  var sheet = getPlayersSheet_();
  var rowNum = findRowByColumn_(sheet, 'guestToken', token);
  if (rowNum === 0) return { success: false, error: 'token_not_found' };

  var row = readRow_(sheet, rowNum);
  if (!row.isBound || row.isBound === 'false') return { success: false, error: 'account_not_bound' };
  if (sha256_(oldPassword) !== row.passwordHash) return { success: false, error: 'wrong_password' };

  writeCell_(sheet, rowNum, 'passwordHash', sha256_(newPassword));
  return { success: true, message: '密碼已更新' };
}

// ═══════════════════════════════════════════════════════
// Save System
// ═══════════════════════════════════════════════════════

var SAVE_HEADERS_ = [
  'playerId','displayName','level','exp','diamond','gold',
  'resourceTimerStage','resourceTimerLastCollect',
  'towerFloor','storyProgress','formation','lastSaved'
];

var HERO_INST_HEADERS_ = [
  'playerId','instanceId','heroId','level','exp','ascension',
  'equippedItems','obtainedAt','stars'
];

/** 取得或建立 save_data Sheet */
function getSaveSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('save_data');
  if (!sheet) {
    sheet = ss.insertSheet('save_data');
    sheet.getRange(1, 1, 1, SAVE_HEADERS_.length).setValues([SAVE_HEADERS_]);
    // resourceTimerStage（第7欄）設為純文字，避免 "1-1" 被自動轉成日期
    sheet.getRange(2, 7, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  }
  return sheet;
}

/** 取得或建立 hero_instances Sheet */
function getHeroInstSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('hero_instances');
  if (!sheet) {
    sheet = ss.insertSheet('hero_instances');
    sheet.getRange(1, 1, 1, HERO_INST_HEADERS_.length).setValues([HERO_INST_HEADERS_]);
  }
  return sheet;
}

/** 用 guestToken 取 playerId（含快取） */
function resolvePlayerId_(guestToken) {
  if (!guestToken) return null;

  // 快取查詢：token→playerId 映射建立後不會變
  var cacheKey = 'pid:' + guestToken;
  var cached = cacheGet_(cacheKey);
  if (cached) return cached;

  var pSheet = getPlayersSheet_();
  var row = findRowByColumn_(pSheet, 'guestToken', guestToken);
  if (row === 0) return null;
  var playerId = readRow_(pSheet, row).playerId;

  // 寫入快取
  if (playerId) cacheSet_(cacheKey, playerId, CACHE_TTL_PLAYER_);
  return playerId;
}

/** 讀取某玩家所有 hero_instances */
function readHeroInstances_(playerId) {
  var sheet = getHeroInstSheet_();
  if (sheet.getLastRow() <= 1) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var pidIdx = headers.indexOf('playerId');
  var results = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][pidIdx]) === String(playerId)) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j];
      results.push(obj);
    }
  }
  return results;
}

/**
 * 載入完整存檔
 * POST { action: "load-save", guestToken }
 */
function handleLoadSave_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var sheet = getSaveSheet_();
  var row = findRowByColumn_(sheet, 'playerId', playerId);
  if (row === 0) {
    return { success: true, saveData: null, heroes: [], isNew: true };
  }

  var saveData = readRow_(sheet, row);
  // 解析 JSON 欄位
  try { saveData.storyProgress = JSON.parse(saveData.storyProgress); } catch(e) { saveData.storyProgress = {chapter:1,stage:1}; }
  try { saveData.formation = JSON.parse(saveData.formation); } catch(e) { saveData.formation = [null,null,null,null,null,null]; }
  try { saveData.gachaPity = JSON.parse(saveData.gachaPity); } catch(e) { saveData.gachaPity = {pullsSinceLastSSR:0,guaranteedFeatured:false}; }

  var heroes = readHeroInstances_(playerId);
  // 解析 equippedItems JSON
  heroes.forEach(function(h) {
    try { h.equippedItems = JSON.parse(h.equippedItems); } catch(e) { h.equippedItems = {}; }
  });

  // 確保 gacha pool 存在 (200組)
  var poolInfo = ensureGachaPool_(playerId, saveData, sheet, row);

  // 重新讀取 saveData 以取得完整 pool（ensureGachaPool_ 可能剛寫入）
  saveData = readRow_(sheet, row);
  var fullPool = [];
  try { fullPool = JSON.parse(saveData.gachaPool || '[]'); } catch(e) { fullPool = []; }
  if (!Array.isArray(fullPool)) fullPool = [];

  // 取得已擁有英雄 ID 清單（供前端本地判斷 isNew）
  var ownedHeroIds = [];
  for (var oi = 0; oi < heroes.length; oi++) {
    var hid = Number(heroes[oi].heroId);
    if (hid && ownedHeroIds.indexOf(hid) === -1) ownedHeroIds.push(hid);
  }

  return {
    success: true, saveData: saveData, heroes: heroes, isNew: false,
    gachaPoolRemaining: poolInfo.remaining,
    gachaPool: fullPool,
    ownedHeroIds: ownedHeroIds
  };
}

/**
 * 新玩家初始化存檔
 * POST { action: "init-save", guestToken }
 */
function handleInitSave_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var sheet = getSaveSheet_();
  // 檢查是否已存在
  if (findRowByColumn_(sheet, 'playerId', playerId) > 0) {
    return { success: true, alreadyExists: true };
  }

  var now = new Date().toISOString();
  // 建立存檔行
  sheet.appendRow([
    playerId,
    '倖存者#' + playerId.replace('P',''),  // displayName
    1,       // level
    0,       // exp
    500,     // diamond
    10000,   // gold
    '1-1',   // resourceTimerStage
    now,     // resourceTimerLastCollect
    0,       // towerFloor
    JSON.stringify({chapter:1,stage:1}),  // storyProgress
    JSON.stringify([null,null,null,null,null,null]), // formation
    now      // lastSaved
  ]);

  // 修正 resourceTimerStage 欄位格式（防止 Google Sheets 自動轉日期）
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 7).setNumberFormat('@').setValue('1-1');

  // 贈送初始英雄（3 隻）：無名活屍(6/N) + 女喪屍(1/R) + 倖存者(9/R)
  var heroSheet = getHeroInstSheet_();
  var starterHeroIds = [6, 1, 9];
  var starterInstanceIds = [];
  for (var si = 0; si < starterHeroIds.length; si++) {
    var hid = starterHeroIds[si];
    var instId = playerId + '_' + hid + '_' + (Date.now() + si);
    heroSheet.appendRow([
      playerId,
      instId,
      hid,     // heroId
      1,       // level
      0,       // exp
      0,       // ascension
      '{}',    // equippedItems
      now,     // obtainedAt
      0        // stars (所有英雄從 ★0 開始)
    ]);
    starterInstanceIds.push(instId);
  }

  // 自動上陣：3 隻初始英雄分別放在 slot 0, 1, 2
  var autoFormation = [
    starterHeroIds[0], starterHeroIds[1], starterHeroIds[2],
    null, null, null
  ];
  var saveLastRow = sheet.getLastRow();
  // formation 欄位（第 11 欄）
  sheet.getRange(saveLastRow, 11).setValue(JSON.stringify(autoFormation));

  return {
    success: true,
    alreadyExists: false,
    starterHeroInstanceId: starterInstanceIds[0]
  };
}

/**
 * 增量存檔
 * POST { action: "save-progress", guestToken, changes: { gold, diamond, exp, level, ... } }
 */
function handleSaveProgress_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var changes = params.changes;
  if (!changes) return { success: false, error: 'missing changes' };

  var sheet = getSaveSheet_();
  var row = findRowByColumn_(sheet, 'playerId', playerId);
  if (row === 0) return { success: false, error: 'save_not_found' };

  var allowedFields = ['displayName','level','exp','diamond','gold',
    'resourceTimerStage','resourceTimerLastCollect','towerFloor',
    'storyProgress','formation'];

  Object.keys(changes).forEach(function(key) {
    if (allowedFields.indexOf(key) === -1) return;
    var val = changes[key];
    // JSON 欄位自動序列化
    if (key === 'storyProgress' || key === 'formation') {
      val = typeof val === 'string' ? val : JSON.stringify(val);
    }
    writeCell_(sheet, row, key, val);
  });

  writeCell_(sheet, row, 'lastSaved', new Date().toISOString());
  return { success: true, lastSaved: new Date().toISOString() };
}

/**
 * 儲存陣型
 * POST { action: "save-formation", guestToken, formation: [...] }
 */
function handleSaveFormation_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  if (!params.formation) return { success: false, error: 'missing formation' };

  var sheet = getSaveSheet_();
  var row = findRowByColumn_(sheet, 'playerId', playerId);
  if (row === 0) return { success: false, error: 'save_not_found' };

  writeCell_(sheet, row, 'formation', JSON.stringify(params.formation));
  writeCell_(sheet, row, 'lastSaved', new Date().toISOString());
  return { success: true };
}

/**
 * 新增英雄（抽卡/獎勵）
 * POST { action: "add-hero", guestToken, heroId }
 */
function handleAddHero_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  if (!params.heroId) return { success: false, error: 'missing heroId' };

  var sheet = getHeroInstSheet_();
  var instanceId = playerId + '_' + params.heroId + '_' + Date.now();
  var now = new Date().toISOString();

  sheet.appendRow([
    playerId,
    instanceId,
    params.heroId,
    1,    // level
    0,    // exp
    0,    // ascension
    '{}', // equippedItems
    now,  // obtainedAt
    0     // stars (所有英雄從 ★0 開始)
  ]);

  return { success: true, instanceId: instanceId };
}

/**
 * 領取資源計時器累積
 * POST { action: "collect-resources", guestToken, opId? }
 */
function handleCollectResources_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  return executeWithIdempotency_(params.opId, playerId, 'collect-resources', function() {
    var sheet = getSaveSheet_();
    var row = findRowByColumn_(sheet, 'playerId', playerId);
    if (row === 0) return { success: false, error: 'save_not_found' };

    var saveData = readRow_(sheet, row);
    var stageId = saveData.resourceTimerStage || '1-1';
    var lastCollect = saveData.resourceTimerLastCollect;
    if (!lastCollect) return { success: false, error: 'timer_not_started' };

    // 尚未通關 1-1 → 離線獎勵未解鎖
    var sp;
    try { sp = JSON.parse(saveData.storyProgress); } catch(e) { sp = {chapter:1,stage:1}; }
    if (sp && sp.chapter === 1 && sp.stage === 1) {
      return { success: true, gold: 0, expItems: 0, message: 'not_unlocked' };
    }

    var elapsed = (Date.now() - new Date(lastCollect).getTime()) / (3600 * 1000);
    var maxHours = 24;
    var hours = Math.min(maxHours, Math.max(0, elapsed));

    var parts = stageId.split('-');
    var ch = parseInt(parts[0]) || 1;
    var st = parseInt(parts[1]) || 1;
    var progress = (ch - 1) * 8 + st;
    var goldPerHour = 100 + progress * 50;
    var expItemsPerHour = Math.max(1, Math.floor(progress / 3));

    var goldGain = Math.floor(goldPerHour * hours);
    var expItemsGain = Math.floor(expItemsPerHour * hours);

    if (goldGain <= 0 && expItemsGain <= 0) {
      return { success: true, gold: 0, expItems: 0, message: 'nothing_to_collect' };
    }

    var currentGold = Number(saveData.gold) || 0;
    writeCell_(sheet, row, 'gold', currentGold + goldGain);
    var now = new Date().toISOString();
    writeCell_(sheet, row, 'resourceTimerLastCollect', now);
    writeCell_(sheet, row, 'lastSaved', now);

    return {
      success: true,
      gold: goldGain,
      expItems: expItemsGain,
      newGoldTotal: currentGold + goldGain,
      hoursElapsed: Math.round(hours * 10) / 10
    };
  }); // end executeWithIdempotency_
}

// ═══════════════════════════════════════════════════════
// Inventory System
// ═══════════════════════════════════════════════════════

var INVENTORY_HEADERS_ = ['playerId','itemId','quantity'];
var EQUIP_INST_HEADERS_ = ['playerId','equipId','templateId','setId','slot','rarity','mainStat','mainStatValue','enhanceLevel','subStats','equippedBy','locked','obtainedAt'];

function getInventorySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('inventory');
  if (!sheet) {
    sheet = ss.insertSheet('inventory');
    sheet.getRange(1, 1, 1, INVENTORY_HEADERS_.length).setValues([INVENTORY_HEADERS_]);
  }
  return sheet;
}

function getEquipInstSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('equipment_instances');
  if (!sheet) {
    sheet = ss.insertSheet('equipment_instances');
    sheet.getRange(1, 1, 1, EQUIP_INST_HEADERS_.length).setValues([EQUIP_INST_HEADERS_]);
  }
  return sheet;
}

/** 讀取玩家所有道具 */
function readPlayerItems_(playerId) {
  var sheet = getInventorySheet_();
  if (sheet.getLastRow() <= 1) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var pidIdx = headers.indexOf('playerId');
  var results = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][pidIdx]) === String(playerId)) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j];
      results.push(obj);
    }
  }
  return results;
}

/** 讀取玩家所有裝備 */
function readPlayerEquipment_(playerId) {
  var sheet = getEquipInstSheet_();
  if (sheet.getLastRow() <= 1) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var pidIdx = headers.indexOf('playerId');
  var results = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][pidIdx]) === String(playerId)) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) obj[headers[j]] = data[i][j];
      results.push(obj);
    }
  }
  return results;
}

/** 更新或新增玩家道具數量 */
function upsertItem_(playerId, itemId, delta) {
  var sheet = getInventorySheet_();
  if (sheet.getLastRow() <= 1) {
    // 空表，直接新增
    sheet.appendRow([playerId, itemId, Math.max(0, delta)]);
    return Math.max(0, delta);
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var pidIdx = headers.indexOf('playerId');
  var iidIdx = headers.indexOf('itemId');
  var qIdx = headers.indexOf('quantity');

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][pidIdx]) === String(playerId) && String(data[i][iidIdx]) === String(itemId)) {
      var newQty = Math.max(0, Number(data[i][qIdx]) + delta);
      sheet.getRange(i + 2, qIdx + 1).setValue(newQty);
      return newQty;
    }
  }
  // 不存在 → 新增
  var qty = Math.max(0, delta);
  sheet.appendRow([playerId, itemId, qty]);
  return qty;
}

/** 取得道具數量 */
function getItemQty_(playerId, itemId) {
  var items = readPlayerItems_(playerId);
  for (var i = 0; i < items.length; i++) {
    if (items[i].itemId === itemId) return Number(items[i].quantity) || 0;
  }
  return 0;
}

/** 載入道具定義表 */
function handleLoadItemDefinitions_() {
  // 快取查詢
  var cached = cacheGet_('itemDefs');
  if (cached) { cached._cached = true; return cached; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('item_definitions');
  if (!sheet) return { success: true, items: [] };
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, items: [] };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var items = data.map(function(row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) obj[headers[i]] = row[i];
    return obj;
  });
  var result = { success: true, items: items };
  cacheSet_('itemDefs', result, CACHE_TTL_CONFIG_);
  return result;
}

/** 載入完整背包 */
function handleLoadInventory_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var items = readPlayerItems_(playerId);
  var equipment = readPlayerEquipment_(playerId);
  // 取得容量（存在 save_data 的 equipmentCapacity，若不存在用預設 200）
  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  var capacity = 200;
  if (saveRow > 0) {
    var saveData = readRow_(saveSheet, saveRow);
    capacity = Number(saveData.equipmentCapacity) || 200;
  }
  return { success: true, items: items, equipment: equipment, equipmentCapacity: capacity };
}

/** 批量增加道具 */
function handleAddItems_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var items = params.items;
  if (!items || !items.length) return { success: false, error: 'missing items' };
  for (var i = 0; i < items.length; i++) {
    upsertItem_(playerId, items[i].itemId, Number(items[i].quantity) || 0);
  }
  var updatedItems = readPlayerItems_(playerId);
  return { success: true, inventory: updatedItems };
}

/** 批量消耗道具 */
function handleRemoveItems_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var items = params.items;
  if (!items || !items.length) return { success: false, error: 'missing items' };
  // 先檢查是否全部足夠
  for (var i = 0; i < items.length; i++) {
    var have = getItemQty_(playerId, items[i].itemId);
    if (have < Number(items[i].quantity)) {
      return { success: false, error: 'insufficient_' + items[i].itemId + ' (have=' + have + ',need=' + items[i].quantity + ')' };
    }
  }
  for (var j = 0; j < items.length; j++) {
    upsertItem_(playerId, items[j].itemId, -(Number(items[j].quantity) || 0));
  }
  var updatedItems = readPlayerItems_(playerId);
  return { success: true, inventory: updatedItems };
}

/** 出售道具換金幣 */
function handleSellItems_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var items = params.items;
  if (!items || !items.length) return { success: false, error: 'missing items' };

  // 載入道具定義
  var defSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('item_definitions');
  var defMap = {};
  if (defSheet && defSheet.getLastRow() > 1) {
    var dHeaders = defSheet.getRange(1, 1, 1, defSheet.getLastColumn()).getValues()[0];
    var dData = defSheet.getRange(2, 1, defSheet.getLastRow() - 1, defSheet.getLastColumn()).getValues();
    for (var d = 0; d < dData.length; d++) {
      var dObj = {};
      for (var k = 0; k < dHeaders.length; k++) dObj[dHeaders[k]] = dData[d][k];
      defMap[dObj.itemId] = dObj;
    }
  }

  var totalGold = 0;
  for (var i = 0; i < items.length; i++) {
    var qty = Number(items[i].quantity) || 0;
    var have = getItemQty_(playerId, items[i].itemId);
    if (have < qty) return { success: false, error: 'insufficient_' + items[i].itemId };
    var def = defMap[items[i].itemId];
    var price = def ? Number(def.sellPrice) || 0 : 0;
    totalGold += price * qty;
    upsertItem_(playerId, items[i].itemId, -qty);
  }

  // 增加金幣
  if (totalGold > 0) {
    var saveSheet = getSaveSheet_();
    var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
    if (saveRow > 0) {
      var currentGold = Number(readRow_(saveSheet, saveRow).gold) || 0;
      writeCell_(saveSheet, saveRow, 'gold', currentGold + totalGold);
    }
  }

  return { success: true, goldGained: totalGold };
}

/** 使用道具 */
function handleUseItem_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var itemId = params.itemId;
  var qty = Number(params.quantity) || 1;
  var have = getItemQty_(playerId, itemId);
  if (have < qty) return { success: false, error: 'insufficient_item' };
  upsertItem_(playerId, itemId, -qty);
  // 使用效果（簡化版：具體效果未來擴展）
  return { success: true, result: { used: itemId, quantity: qty } };
}

/** 裝備到英雄 */
function handleEquipItem_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var equipId = params.equipId;
  var heroInstanceId = params.heroInstanceId;
  if (!equipId || !heroInstanceId) return { success: false, error: 'missing params' };

  var sheet = getEquipInstSheet_();
  // 找到裝備行
  if (sheet.getLastRow() <= 1) return { success: false, error: 'equip_not_found' };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var eidIdx = headers.indexOf('equipId');
  var pidIdx = headers.indexOf('playerId');
  var eqByIdx = headers.indexOf('equippedBy');
  var slotIdx = headers.indexOf('slot');

  var equipRow = -1;
  var equipSlot = '';
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][eidIdx]) === String(equipId) && String(data[i][pidIdx]) === String(playerId)) {
      equipRow = i + 2;
      equipSlot = String(data[i][slotIdx]);
      break;
    }
  }
  if (equipRow < 0) return { success: false, error: 'equip_not_found' };

  // 先卸下同格位的舊裝備
  for (var j = 0; j < data.length; j++) {
    if (String(data[j][eqByIdx]) === String(heroInstanceId) && String(data[j][slotIdx]) === String(equipSlot) && j + 2 !== equipRow) {
      sheet.getRange(j + 2, eqByIdx + 1).setValue('');
    }
  }

  sheet.getRange(equipRow, eqByIdx + 1).setValue(heroInstanceId);
  return { success: true };
}

/** 卸下裝備 */
function handleUnequipItem_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var equipId = params.equipId;
  if (!equipId) return { success: false, error: 'missing equipId' };

  var sheet = getEquipInstSheet_();
  if (sheet.getLastRow() <= 1) return { success: false, error: 'equip_not_found' };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var eidIdx = headers.indexOf('equipId');
  var pidIdx = headers.indexOf('playerId');
  var eqByIdx = headers.indexOf('equippedBy');

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][eidIdx]) === String(equipId) && String(data[i][pidIdx]) === String(playerId)) {
      sheet.getRange(i + 2, eqByIdx + 1).setValue('');
      return { success: true };
    }
  }
  return { success: false, error: 'equip_not_found' };
}

/** 鎖定/解鎖裝備 */
function handleLockEquipment_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var equipId = params.equipId;
  if (!equipId) return { success: false, error: 'missing equipId' };

  var sheet = getEquipInstSheet_();
  if (sheet.getLastRow() <= 1) return { success: false, error: 'equip_not_found' };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var eidIdx = headers.indexOf('equipId');
  var pidIdx = headers.indexOf('playerId');
  var lockIdx = headers.indexOf('locked');

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][eidIdx]) === String(equipId) && String(data[i][pidIdx]) === String(playerId)) {
      sheet.getRange(i + 2, lockIdx + 1).setValue(params.locked ? true : false);
      return { success: true };
    }
  }
  return { success: false, error: 'equip_not_found' };
}

/** 擴容背包 */
function handleExpandInventory_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };

  var saveData = readRow_(saveSheet, saveRow);
  var currentCapacity = Number(saveData.equipmentCapacity) || 200;
  if (currentCapacity >= 500) return { success: false, error: 'max_capacity' };

  var diamond = Number(saveData.diamond) || 0;
  if (diamond < 100) return { success: false, error: 'insufficient_diamond' };

  var newCapacity = Math.min(500, currentCapacity + 50);
  writeCell_(saveSheet, saveRow, 'diamond', diamond - 100);
  writeCell_(saveSheet, saveRow, 'equipmentCapacity', newCapacity);
  return { success: true, newCapacity: newCapacity };
}

// ═══════════════════════════════════════════════════════
// Progression System
// ═══════════════════════════════════════════════════════

var EXP_MATERIALS_ = { 'exp_core_s': 100, 'exp_core_m': 500, 'exp_core_l': 2000 };
var ASC_LEVEL_CAP_ = { 0: 20, 1: 30, 2: 40, 3: 50, 4: 60, 5: 60 };
var ASC_COSTS_ = [
  { fragments: 5, classStones: 3, gold: 5000 },
  { fragments: 10, classStones: 8, gold: 15000 },
  { fragments: 20, classStones: 15, gold: 40000 },
  { fragments: 40, classStones: 25, gold: 80000 },
  { fragments: 60, classStones: 40, gold: 150000 }
];
var STAR_COSTS_ = { 0: 5, 1: 10, 2: 20, 3: 40, 4: 80, 5: 160 };

function expToNextLevel_(level) {
  var base = 100;
  var tier = Math.floor((level - 1) / 10);
  return Math.floor(base * Math.pow(1.8, tier) * (1 + (level % 10) * 0.15));
}

/** 英雄升級 */
function handleUpgradeHero_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var instanceId = params.instanceId;
  var materials = params.materials;
  if (!instanceId || !materials) return { success: false, error: 'missing params' };

  var heroSheet = getHeroInstSheet_();
  var heroRow = findRowByColumn_(heroSheet, 'instanceId', instanceId);
  if (heroRow === 0) return { success: false, error: 'hero_not_found' };
  var hero = readRow_(heroSheet, heroRow);
  if (String(hero.playerId) !== String(playerId)) return { success: false, error: 'not_your_hero' };

  // 計算總經驗值
  var totalExp = 0;
  var consumed = [];
  for (var i = 0; i < materials.length; i++) {
    var mat = materials[i];
    var expVal = EXP_MATERIALS_[mat.itemId];
    if (!expVal) continue;
    var qty = Number(mat.quantity) || 0;
    var have = getItemQty_(playerId, mat.itemId);
    var use = Math.min(qty, have);
    if (use <= 0) continue;
    totalExp += expVal * use;
    consumed.push({ itemId: mat.itemId, quantity: use });
  }

  if (totalExp <= 0) return { success: false, error: 'no_valid_materials' };

  // 扣素材
  for (var j = 0; j < consumed.length; j++) {
    upsertItem_(playerId, consumed[j].itemId, -consumed[j].quantity);
  }

  // 升級
  var lvl = Number(hero.level) || 1;
  var exp = Number(hero.exp) || 0;
  var asc = Number(hero.ascension) || 0;
  var cap = ASC_LEVEL_CAP_[asc] || 20;

  while (totalExp > 0 && lvl < cap) {
    var needed = expToNextLevel_(lvl) - exp;
    if (totalExp >= needed) {
      totalExp -= needed;
      exp = 0;
      lvl++;
    } else {
      exp += totalExp;
      totalExp = 0;
    }
  }
  if (lvl >= cap) exp = 0;

  writeCell_(heroSheet, heroRow, 'level', lvl);
  writeCell_(heroSheet, heroRow, 'exp', exp);

  return {
    success: true,
    newLevel: lvl,
    newExp: exp,
    expConsumed: totalExp,
    materialsConsumed: consumed
  };
}

/** 英雄突破 */
function handleAscendHero_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var instanceId = params.instanceId;
  if (!instanceId) return { success: false, error: 'missing instanceId' };

  var heroSheet = getHeroInstSheet_();
  var heroRow = findRowByColumn_(heroSheet, 'instanceId', instanceId);
  if (heroRow === 0) return { success: false, error: 'hero_not_found' };
  var hero = readRow_(heroSheet, heroRow);
  if (String(hero.playerId) !== String(playerId)) return { success: false, error: 'not_your_hero' };

  var asc = Number(hero.ascension) || 0;
  if (asc >= 5) return { success: false, error: 'max_ascension' };
  var lvl = Number(hero.level) || 1;
  var reqLvl = ASC_LEVEL_CAP_[asc] || 20;
  if (lvl < reqLvl) return { success: false, error: 'level_too_low' };

  var cost = ASC_COSTS_[asc];
  if (!cost) return { success: false, error: 'invalid_ascension' };
  var heroId = Number(hero.heroId);

  // 檢查碎片
  var fragId = 'asc_fragment_' + heroId;
  if (getItemQty_(playerId, fragId) < cost.fragments) return { success: false, error: 'insufficient_fragments' };

  // 檢查職業石（簡化：查 heroes 表取 Type）
  var heroesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('heroes');
  var heroBaseRow = findRowByColumn_(heroesSheet, 'HeroID', heroId);
  var heroType = 'power';
  if (heroBaseRow > 0) {
    var hData = readRow_(heroesSheet, heroBaseRow);
    var typeMap = { '力量': 'power', '敏捷': 'agility', '坦克': 'defense', '刺客': 'agility', '特殊': 'power', '均衡': 'power', '輔助': 'defense' };
    heroType = typeMap[hData.Type] || 'power';
  }
  var classStoneId = 'asc_class_' + heroType;
  var universalId = 'asc_class_universal';
  var classHave = getItemQty_(playerId, classStoneId);
  var uniHave = getItemQty_(playerId, universalId);
  if (classHave + uniHave < cost.classStones) return { success: false, error: 'insufficient_class_stones' };

  // 檢查金幣
  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };
  var saveData = readRow_(saveSheet, saveRow);
  var gold = Number(saveData.gold) || 0;
  if (gold < cost.gold) return { success: false, error: 'insufficient_gold' };

  // 扣除資源
  upsertItem_(playerId, fragId, -cost.fragments);
  var classUse = Math.min(classHave, cost.classStones);
  var uniUse = cost.classStones - classUse;
  if (classUse > 0) upsertItem_(playerId, classStoneId, -classUse);
  if (uniUse > 0) upsertItem_(playerId, universalId, -uniUse);
  writeCell_(saveSheet, saveRow, 'gold', gold - cost.gold);

  // 突破
  var newAsc = asc + 1;
  writeCell_(heroSheet, heroRow, 'ascension', newAsc);

  return {
    success: true,
    newAscension: newAsc,
    newLevelCap: ASC_LEVEL_CAP_[newAsc] || 60
  };
}

/** 英雄升星 */
function handleStarUpHero_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var instanceId = params.instanceId;
  if (!instanceId) return { success: false, error: 'missing instanceId' };

  var heroSheet = getHeroInstSheet_();
  var heroRow = findRowByColumn_(heroSheet, 'instanceId', instanceId);
  if (heroRow === 0) return { success: false, error: 'hero_not_found' };
  var hero = readRow_(heroSheet, heroRow);
  if (String(hero.playerId) !== String(playerId)) return { success: false, error: 'not_your_hero' };

  // hero_instances 需要 stars 欄位 (0 星為初始值)
  var stars = (hero.stars != null && hero.stars !== '') ? Number(hero.stars) : 0;
  if (stars >= 6) return { success: false, error: 'max_stars' };

  var cost = STAR_COSTS_[stars];
  if (!cost) return { success: false, error: 'invalid_stars' };

  var heroId = Number(hero.heroId);
  var fragId = 'asc_fragment_' + heroId;
  if (getItemQty_(playerId, fragId) < cost) return { success: false, error: 'insufficient_fragments' };

  upsertItem_(playerId, fragId, -cost);
  var newStars = stars + 1;

  // 確保 stars 欄位存在
  var headers = heroSheet.getRange(1, 1, 1, heroSheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('stars') === -1) {
    heroSheet.getRange(1, headers.length + 1).setValue('stars');
    headers.push('stars');
  }
  var starsCol = headers.indexOf('stars') + 1;
  heroSheet.getRange(heroRow, starsCol).setValue(newStars);

  return { success: true, newStars: newStars, fragmentsConsumed: cost };
}

/** 裝備強化 */
function handleEnhanceEquipment_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var equipId = params.equipId;
  var materials = params.materials;
  if (!equipId || !materials) return { success: false, error: 'missing params' };

  var eqSheet = getEquipInstSheet_();
  if (eqSheet.getLastRow() <= 1) return { success: false, error: 'equip_not_found' };
  var headers = eqSheet.getRange(1, 1, 1, eqSheet.getLastColumn()).getValues()[0];
  var data = eqSheet.getRange(2, 1, eqSheet.getLastRow() - 1, eqSheet.getLastColumn()).getValues();
  var eidIdx = headers.indexOf('equipId');
  var pidIdx = headers.indexOf('playerId');
  var eLvlIdx = headers.indexOf('enhanceLevel');
  var rarIdx = headers.indexOf('rarity');
  var mainValIdx = headers.indexOf('mainStatValue');

  var eqRow = -1;
  var eqData = null;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][eidIdx]) === String(equipId) && String(data[i][pidIdx]) === String(playerId)) {
      eqRow = i + 2;
      eqData = data[i];
      break;
    }
  }
  if (!eqData) return { success: false, error: 'equip_not_found' };

  var rarity = String(eqData[rarIdx]);
  var maxLvl = { 'N': 5, 'R': 10, 'SR': 15, 'SSR': 20 }[rarity] || 5;
  var currentLvl = Number(eqData[eLvlIdx]) || 0;
  if (currentLvl >= maxLvl) return { success: false, error: 'max_enhance_level' };

  var ENHANCE_EXP = { 'eqm_enhance_s': 50, 'eqm_enhance_m': 200, 'eqm_enhance_l': 800 };
  var totalEnhanceExp = 0;
  var consumed = [];
  for (var j = 0; j < materials.length; j++) {
    var mat = materials[j];
    var eVal = ENHANCE_EXP[mat.itemId];
    if (!eVal) continue;
    var qty = Number(mat.quantity) || 0;
    var have = getItemQty_(playerId, mat.itemId);
    var use = Math.min(qty, have);
    if (use > 0) {
      totalEnhanceExp += eVal * use;
      consumed.push({ itemId: mat.itemId, quantity: use });
    }
  }
  if (totalEnhanceExp <= 0) return { success: false, error: 'no_valid_materials' };

  // 計算金幣消耗
  var baseCost = { 'N': 100, 'R': 200, 'SR': 500, 'SSR': 1000 }[rarity] || 100;
  var goldCost = Math.floor(baseCost * (1 + currentLvl * 0.5));

  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };
  var gold = Number(readRow_(saveSheet, saveRow).gold) || 0;
  if (gold < goldCost) return { success: false, error: 'insufficient_gold' };

  // 扣素材和金幣
  for (var k = 0; k < consumed.length; k++) {
    upsertItem_(playerId, consumed[k].itemId, -consumed[k].quantity);
  }
  writeCell_(saveSheet, saveRow, 'gold', gold - goldCost);

  // 簡化：每次強化 +1 級
  var newLvl = Math.min(maxLvl, currentLvl + 1);
  eqSheet.getRange(eqRow, eLvlIdx + 1).setValue(newLvl);

  var baseMainVal = Number(eqData[mainValIdx]) || 0;
  var newMainVal = Math.floor(baseMainVal * (1 + newLvl * 0.1));

  return {
    success: true,
    newLevel: newLvl,
    newMainStatValue: newMainVal,
    materialsConsumed: consumed,
    goldConsumed: goldCost
  };
}

/** 鍛造裝備 */
function handleForgeEquipment_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  // 簡化：目前鍛造暫不實作完整材料檢查，直接建立裝備
  return { success: false, error: 'forge_not_implemented_yet' };
}

/** 拆解裝備 */
function handleDismantleEquipment_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var equipId = params.equipId;
  if (!equipId) return { success: false, error: 'missing equipId' };

  var eqSheet = getEquipInstSheet_();
  if (eqSheet.getLastRow() <= 1) return { success: false, error: 'equip_not_found' };
  var headers = eqSheet.getRange(1, 1, 1, eqSheet.getLastColumn()).getValues()[0];
  var data = eqSheet.getRange(2, 1, eqSheet.getLastRow() - 1, eqSheet.getLastColumn()).getValues();
  var eidIdx = headers.indexOf('equipId');
  var pidIdx = headers.indexOf('playerId');
  var lockIdx = headers.indexOf('locked');
  var rarIdx = headers.indexOf('rarity');
  var eLvlIdx = headers.indexOf('enhanceLevel');

  var targetRow = -1;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][eidIdx]) === String(equipId) && String(data[i][pidIdx]) === String(playerId)) {
      if (data[i][lockIdx] === true || data[i][lockIdx] === 'TRUE') return { success: false, error: 'equipment_locked' };
      targetRow = i + 2;
      var rarity = String(data[i][rarIdx]);
      var eLvl = Number(data[i][eLvlIdx]) || 0;

      // 計算返還
      var goldGained = { 'N': 50, 'R': 100, 'SR': 300, 'SSR': 800 }[rarity] || 50;
      var enhanceStones = Math.floor(eLvl / 2);

      eqSheet.deleteRow(targetRow);

      if (enhanceStones > 0) upsertItem_(playerId, 'eqm_enhance_s', enhanceStones);

      // 加金幣
      var saveSheet = getSaveSheet_();
      var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
      if (saveRow > 0) {
        var currentGold = Number(readRow_(saveSheet, saveRow).gold) || 0;
        writeCell_(saveSheet, saveRow, 'gold', currentGold + goldGained);
      }

      return {
        success: true,
        goldGained: goldGained,
        materialsGained: enhanceStones > 0 ? [{ itemId: 'eqm_enhance_s', quantity: enhanceStones }] : []
      };
    }
  }
  return { success: false, error: 'equip_not_found' };
}

// ═══════════════════════════════════════════════════════
// Stage System
// ═══════════════════════════════════════════════════════

/** 通關主線 */
function handleCompleteStage_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var stageId = params.stageId;
  var starsEarned = Number(params.starsEarned) || 1;
  if (!stageId) return { success: false, error: 'missing stageId' };

  var parts = stageId.split('-');
  var ch = parseInt(parts[0]) || 1;
  var st = parseInt(parts[1]) || 1;

  // 載入 stage_configs 取獎勵
  var stageSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('stage_configs');
  var stageRewards = { gold: 100 + ch * 50 + st * 20, exp: 50 + ch * 30 + st * 10, diamond: 0, items: [] };
  var firstClearRewards = { gold: 200, exp: 100, diamond: 30, items: [] };
  var isFirstClear = false;

  // 更新存檔進度
  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };
  var saveData = readRow_(saveSheet, saveRow);
  var currentProgress;
  try { currentProgress = JSON.parse(saveData.storyProgress); } catch(e) { currentProgress = { chapter: 1, stage: 1 }; }
  var stageStars;
  try { stageStars = JSON.parse(saveData.stageStars || '{}'); } catch(e) { stageStars = {}; }

  // 判斷是否首通
  var prevBest = stageStars[stageId] || 0;
  if (prevBest === 0) isFirstClear = true;
  if (starsEarned > prevBest) stageStars[stageId] = starsEarned;

  // 更新進度
  var newProgress = (ch - 1) * 8 + st;
  var curProgress = (currentProgress.chapter - 1) * 8 + currentProgress.stage;
  var storyUpdated = false;
  if (newProgress >= curProgress) {
    // 進到下一關
    var nextSt = st + 1;
    var nextCh = ch;
    if (nextSt > 8) { nextCh = ch + 1; nextSt = 1; }
    writeCell_(saveSheet, saveRow, 'storyProgress', JSON.stringify({ chapter: nextCh, stage: nextSt }));
    // 更新 resource timer
    writeCell_(saveSheet, saveRow, 'resourceTimerStage', stageId);
    storyUpdated = true;
  }

  writeCell_(saveSheet, saveRow, 'stageStars', JSON.stringify(stageStars));

  // 發放獎勵
  var totalGold = stageRewards.gold;
  var totalDiamond = 0;
  if (isFirstClear) {
    totalGold += firstClearRewards.gold;
    totalDiamond += firstClearRewards.diamond;
  }

  var currentGold = Number(saveData.gold) || 0;
  var currentDiamond = Number(saveData.diamond) || 0;
  writeCell_(saveSheet, saveRow, 'gold', currentGold + totalGold);
  if (totalDiamond > 0) writeCell_(saveSheet, saveRow, 'diamond', currentDiamond + totalDiamond);
  writeCell_(saveSheet, saveRow, 'lastSaved', new Date().toISOString());

  // 確保 stageStars 欄位存在
  var saveHeaders = saveSheet.getRange(1, 1, 1, saveSheet.getLastColumn()).getValues()[0];
  if (saveHeaders.indexOf('stageStars') === -1) {
    saveSheet.getRange(1, saveHeaders.length + 1).setValue('stageStars');
  }

  return {
    success: true,
    rewards: { gold: totalGold, exp: stageRewards.exp, diamond: totalDiamond, items: [] },
    isFirstClear: isFirstClear,
    starsEarned: starsEarned,
    newStoryProgress: storyUpdated ? { chapter: ch + (st >= 8 ? 1 : 0), stage: st >= 8 ? 1 : st + 1 } : undefined
  };
}

/** 爬塔通關 */
function handleCompleteTower_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var floor = Number(params.floor);
  if (!floor || floor < 1) return { success: false, error: 'invalid_floor' };

  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };
  var saveData = readRow_(saveSheet, saveRow);
  var currentFloor = Number(saveData.towerFloor) || 0;

  if (floor !== currentFloor + 1) return { success: false, error: 'wrong_floor' };

  // 計算獎勵
  var isBoss = floor % 10 === 0;
  var rewards = {
    gold: 100 + floor * 20,
    exp: 50 + floor * 10,
    diamond: isBoss ? 50 : 0,
    items: []
  };

  // 更新樓層和金幣
  var currentGold = Number(saveData.gold) || 0;
  var currentDiamond = Number(saveData.diamond) || 0;
  writeCell_(saveSheet, saveRow, 'towerFloor', floor);
  writeCell_(saveSheet, saveRow, 'gold', currentGold + rewards.gold);
  if (rewards.diamond > 0) writeCell_(saveSheet, saveRow, 'diamond', currentDiamond + rewards.diamond);
  writeCell_(saveSheet, saveRow, 'lastSaved', new Date().toISOString());

  return { success: true, rewards: rewards, newFloor: floor };
}

/** 每日副本通關 */
function handleCompleteDaily_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var dungeonId = params.dungeonId;
  var tier = params.tier;
  if (!dungeonId || !tier) return { success: false, error: 'missing params' };

  // 簡化版：每日次數暫由前端控制，後端直接發獎勵
  var tierRewards = {
    'easy':   { gold: 500, exp: 100 },
    'normal': { gold: 1000, exp: 200 },
    'hard':   { gold: 2000, exp: 400 }
  };
  var base = tierRewards[tier] || tierRewards['easy'];

  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };
  var saveData = readRow_(saveSheet, saveRow);
  var currentGold = Number(saveData.gold) || 0;
  writeCell_(saveSheet, saveRow, 'gold', currentGold + base.gold);
  writeCell_(saveSheet, saveRow, 'lastSaved', new Date().toISOString());

  return {
    success: true,
    rewards: { gold: base.gold, exp: base.exp, items: [] },
    remainingAttempts: 2  // 簡化
  };
}

// ═══════════════════════════════════════════════════════
// Gacha System — 預加載池 (每次補充 200 組)
// ═══════════════════════════════════════════════════════

var GACHA_REFILL_COUNT_ = 400;

/**
 * 載入英雄池模板 (heroes sheet)（含快取）
 */
function loadHeroPool_() {
  var cached = cacheGet_('heroPool');
  if (cached) return cached;

  var heroesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('heroes');
  var pool = [];
  if (heroesSheet && heroesSheet.getLastRow() > 1) {
    var hHeaders = heroesSheet.getRange(1, 1, 1, heroesSheet.getLastColumn()).getValues()[0];
    var hData = heroesSheet.getRange(2, 1, heroesSheet.getLastRow() - 1, heroesSheet.getLastColumn()).getValues();
    var idIdx = hHeaders.indexOf('HeroID');
    var rarIdx = hHeaders.indexOf('Rarity');
    for (var h = 0; h < hData.length; h++) {
      pool.push({ heroId: Number(hData[h][idIdx]), rarity: Number(hData[h][rarIdx]) });
    }
  }

  cacheSet_('heroPool', pool, CACHE_TTL_CONFIG_);
  return pool;
}

/**
 * 生成 N 筆抽卡結果（考慮保底機制）
 * @param {Array} heroPool - 英雄池
 * @param {{pullsSinceLastSSR:number, guaranteedFeatured:boolean}} startPity - 起始保底狀態
 * @param {number} count - 要生成幾筆
 * @returns {{entries: Array, endPity: Object}}
 */
function generateGachaPoolEntries_(heroPool, startPity, count) {
  var RATE_SSR = 0.015, RATE_SR = 0.10, RATE_R = 0.35;
  var rarityToNum = { 'N': 1, 'R': 2, 'SR': 3, 'SSR': 4 };
  var entries = [];
  var pullsSinceSSR = Number(startPity.pullsSinceLastSSR) || 0;
  var guaranteedFeatured = startPity.guaranteedFeatured || false;

  for (var i = 0; i < count; i++) {
    // 計算有效 SSR 機率
    var effectiveSSR = RATE_SSR;
    if (pullsSinceSSR + 1 >= 90) {
      effectiveSSR = 1.0;
    } else if (pullsSinceSSR + 1 >= 75) {
      effectiveSSR = RATE_SSR + (pullsSinceSSR + 1 - 75) * 0.05;
    }

    var roll = Math.random();
    var rarity;
    if (roll < effectiveSSR) rarity = 'SSR';
    else if (roll < effectiveSSR + RATE_SR) rarity = 'SR';
    else if (roll < effectiveSSR + RATE_SR + RATE_R) rarity = 'R';
    else rarity = 'N';

    // 選英雄
    var candidates = heroPool.filter(function(hp) { return hp.rarity === rarityToNum[rarity]; });
    if (candidates.length === 0) candidates = heroPool;
    var selected = candidates[Math.floor(Math.random() * candidates.length)];
    var isFeatured = false; // 常駐池無 UP

    // 更新保底
    if (rarity === 'SSR') {
      pullsSinceSSR = 0;
      guaranteedFeatured = !isFeatured;
    } else {
      pullsSinceSSR++;
    }

    // 用縮寫 key 節省空間: h=heroId, r=rarity, f=isFeatured
    entries.push({ h: selected.heroId, r: rarity, f: isFeatured });
  }

  return {
    entries: entries,
    endPity: { pullsSinceLastSSR: pullsSinceSSR, guaranteedFeatured: guaranteedFeatured }
  };
}

/**
 * 確保欄位存在
 */
function ensureColumn_(sheet, colName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf(colName) === -1) {
    sheet.getRange(1, headers.length + 1).setValue(colName);
  }
}

/**
 * 確保玩家的 gacha pool 存在並補充
 * @param {boolean} [forceRefill=false] true = 無條件追加 GACHA_REFILL_COUNT_ 組（refill-pool 用）
 *                                      false = 只在池為空時補到 GACHA_REFILL_COUNT_ 組（initSave 用）
 * @returns {{remaining: number}} pool 目前剩餘數量
 */
function ensureGachaPool_(playerId, saveData, saveSheet, saveRow, forceRefill) {
  // 確保欄位存在
  ensureColumn_(saveSheet, 'gachaPool');
  ensureColumn_(saveSheet, 'gachaPoolEndPity');

  // 讀取現有 pool
  var pool = [];
  try { pool = JSON.parse(saveData.gachaPool || '[]'); } catch(e) { pool = []; }
  if (!Array.isArray(pool)) pool = [];

  var need;
  if (forceRefill) {
    // refill-pool：無條件追加 200 組
    need = GACHA_REFILL_COUNT_;
  } else {
    // initSave：僅在池不足時補到 GACHA_REFILL_COUNT_ 組
    need = GACHA_REFILL_COUNT_ - pool.length;
    if (need <= 0) return { remaining: pool.length };
  }

  // 載入英雄池
  var heroPool = loadHeroPool_();
  if (heroPool.length === 0) return { remaining: pool.length };

  // 讀取 poolEndPity（用來生成新 entries 的起始保底狀態）
  var poolEndPity;
  try { poolEndPity = JSON.parse(saveData.gachaPoolEndPity || '{}'); } catch(e) { poolEndPity = {}; }
  if (!poolEndPity.pullsSinceLastSSR && poolEndPity.pullsSinceLastSSR !== 0) {
    // 首次生成，用 gachaPity 作為起點
    try { poolEndPity = JSON.parse(saveData.gachaPity || '{}'); } catch(e2) { poolEndPity = {}; }
  }
  poolEndPity.pullsSinceLastSSR = Number(poolEndPity.pullsSinceLastSSR) || 0;
  poolEndPity.guaranteedFeatured = poolEndPity.guaranteedFeatured || false;

  // 生成缺少的 entries
  var gen = generateGachaPoolEntries_(heroPool, poolEndPity, need);
  pool = pool.concat(gen.entries);

  // 寫回
  writeCell_(saveSheet, saveRow, 'gachaPool', JSON.stringify(pool));
  writeCell_(saveSheet, saveRow, 'gachaPoolEndPity', JSON.stringify(gen.endPity));

  return { remaining: pool.length };
}

/**
 * 消耗 gacha pool 的前 N 筆（抽卡）
 */
function handleGachaPull_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var count = Number(params.count) || 1;
  if (count !== 1 && count !== 10) return { success: false, error: 'invalid_count' };

  return executeWithIdempotency_(params.opId, playerId, 'gacha-pull', function() {
    var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };
  var saveData = readRow_(saveSheet, saveRow);

  // 扣鑽石
  var cost = count === 10 ? 1440 : 160;
  var diamond = Number(saveData.diamond) || 0;
  if (diamond < cost) return { success: false, error: 'insufficient_diamond' };

  // ⚠️ 不呼叫 ensureGachaPool_() — 避免 phantom entries 汙染 poolEndPity
  // 池補充完全由 handleRefillPool_() 負責（client 主動呼叫）

  // 讀取 pool（不重新生成）
  var pool = [];
  try { pool = JSON.parse(saveData.gachaPool || '[]'); } catch(e) { pool = []; }
  if (!Array.isArray(pool)) pool = [];

  // 如果 pool 不夠（gacha-pull 是背景通知，可能 race），就取能取的
  var actualCount = Math.min(count, pool.length);
  if (actualCount === 0) {
    // pool 已空，只做扣鑽不取 entries（client 已本地處理過結果）
    writeCell_(saveSheet, saveRow, 'diamond', diamond - cost);
    return { success: true, results: [], diamondCost: cost, gachaPoolRemaining: 0 };
  }

  // 取出前 actualCount 筆
  var consumed = pool.splice(0, actualCount);

  // 讀取當前保底狀態（用於 UI 顯示）
  var pityState;
  try { pityState = JSON.parse(saveData.gachaPity || '{}'); } catch(e) { pityState = {}; }
  var pullsSinceSSR = Number(pityState.pullsSinceLastSSR) || 0;
  var guaranteedFeatured = pityState.guaranteedFeatured || false;

  // 載入玩家已有英雄
  var ownedHeroes = {};
  var heroInstances = readHeroInstances_(playerId);
  for (var o = 0; o < heroInstances.length; o++) {
    ownedHeroes[Number(heroInstances[o].heroId)] = true;
  }

  // 處理每筆結果
  var results = [];
  for (var p = 0; p < consumed.length; p++) {
    var entry = consumed[p];
    var heroId = entry.h;
    var rarity = entry.r;
    var isFeatured = entry.f || false;
    var isNew = !ownedHeroes[heroId];

    if (isNew) {
      var hSheet = getHeroInstSheet_();
      var instId = playerId + '_' + heroId + '_' + Date.now() + '_' + p;
      hSheet.appendRow([playerId, instId, heroId, 1, 0, 0, '{}', new Date().toISOString(), 0]);
      ownedHeroes[heroId] = true;
    } else {
      var dustMap = { 'SSR': 25, 'SR': 5, 'R': 1, 'N': 1 };
      var fragMap = { 1: 5, 2: 5, 3: 15, 4: 40 };
      // 找到英雄的 rarity num
      var heroPool = loadHeroPool_();
      var heroRarNum = 1;
      for (var hh = 0; hh < heroPool.length; hh++) {
        if (heroPool[hh].heroId === heroId) { heroRarNum = heroPool[hh].rarity; break; }
      }
      var stardust = dustMap[rarity] || 0;
      var fragments = fragMap[heroRarNum] || 5;
      if (stardust > 0) upsertItem_(playerId, 'currency_stardust', stardust);
      if (fragments > 0) upsertItem_(playerId, 'asc_fragment_' + heroId, fragments);
    }

    // 更新顯示用保底
    if (rarity === 'SSR') {
      pullsSinceSSR = 0;
      guaranteedFeatured = !isFeatured;
    } else {
      pullsSinceSSR++;
    }

    results.push({ heroId: heroId, rarity: rarity, isNew: isNew, isFeatured: isFeatured });
  }

  // 寫入：扣鑽石、更新 pool、更新保底
  writeCell_(saveSheet, saveRow, 'diamond', diamond - cost);
  ensureColumn_(saveSheet, 'gachaPity');
  writeCell_(saveSheet, saveRow, 'gachaPity', JSON.stringify({ pullsSinceLastSSR: pullsSinceSSR, guaranteedFeatured: guaranteedFeatured }));
  writeCell_(saveSheet, saveRow, 'gachaPool', JSON.stringify(pool));
  writeCell_(saveSheet, saveRow, 'lastSaved', new Date().toISOString());

  // ⚠️ 不在此處呼叫 ensureGachaPool_() — 避免生成 phantom entries 導致
  //    poolEndPity 超前 client 實際 pity，造成 refill 後 SSR 位置錯位
  //    補池只由 handleRefillPool_() 負責（client 主動請求）

    return {
      success: true,
      results: results,
      diamondCost: cost,
      newPityState: { pullsSinceLastSSR: pullsSinceSSR, guaranteedFeatured: guaranteedFeatured },
      gachaPoolRemaining: pool.length
    };
  }); // end executeWithIdempotency_
}

/**
 * 查詢 gacha pool 狀態
 */
function handleGachaPoolStatus_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };
  var saveData = readRow_(saveSheet, saveRow);

  var pool = [];
  try { pool = JSON.parse(saveData.gachaPool || '[]'); } catch(e) { pool = []; }

  return {
    success: true,
    remaining: Array.isArray(pool) ? pool.length : 0,
    total: GACHA_REFILL_COUNT_
  };
}

/**
 * 補充抽卡池（每次追加 200 組）並回傳「新生成的 entries」
 * POST { action: "refill-pool", guestToken }
 * 前端在消耗池後背景呼叫，取回補充的新 entries（⚠️ 只回傳新生成的，不回傳全池）
 */
function handleRefillPool_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };
  var saveData = readRow_(saveSheet, saveRow);

  // ⚠️ Client 回報本地剩餘 pool 數量 → 同步 server pool
  // 解決 race condition：client 已本地消耗 entries，但 gacha-pull 通知尚未到 server
  var poolBefore = [];
  try { poolBefore = JSON.parse(saveData.gachaPool || '[]'); } catch(e) { poolBefore = []; }
  if (!Array.isArray(poolBefore)) poolBefore = [];

  if (typeof params.clientPoolRemaining !== 'undefined') {
    var clientRemaining = Number(params.clientPoolRemaining);
    if (!isNaN(clientRemaining) && clientRemaining >= 0 && poolBefore.length > clientRemaining) {
      // 保留 pool 末端（= client 尚未消耗的 entries），去掉前端已消耗部分
      poolBefore = poolBefore.slice(poolBefore.length - clientRemaining);
      writeCell_(saveSheet, saveRow, 'gachaPool', JSON.stringify(poolBefore));
      saveData.gachaPool = JSON.stringify(poolBefore);
    }
  }

  // ⚠️ 重新校正 poolEndPity：以 client 的 pity 為起點，走過剩餘 entries 得到正確 endPity
  // 這能修正 handleGachaPull_ 在背景產生 phantom entries 導致的 poolEndPity 偏移
  if (typeof params.clientPity !== 'undefined') {
    var cp = params.clientPity;
    var recalcPity = {
      pullsSinceLastSSR: Number(cp.pullsSinceLastSSR) || 0,
      guaranteedFeatured: cp.guaranteedFeatured || false
    };
    // 走過剩餘 pool entries 來推算 endPity
    for (var ci = 0; ci < poolBefore.length; ci++) {
      if (poolBefore[ci].r === 'SSR') {
        recalcPity.pullsSinceLastSSR = 0;
        recalcPity.guaranteedFeatured = !poolBefore[ci].f;
      } else {
        recalcPity.pullsSinceLastSSR++;
      }
    }
    writeCell_(saveSheet, saveRow, 'gachaPoolEndPity', JSON.stringify(recalcPity));
    saveData.gachaPoolEndPity = JSON.stringify(recalcPity);
  }

  var lengthBefore = poolBefore.length;

  var poolInfo = ensureGachaPool_(playerId, saveData, saveSheet, saveRow, true);

  // 重新讀取取得完整 pool（ensureGachaPool_ 已寫入新 entries）
  saveData = readRow_(saveSheet, saveRow);
  var fullPool = [];
  try { fullPool = JSON.parse(saveData.gachaPool || '[]'); } catch(e) { fullPool = []; }
  if (!Array.isArray(fullPool)) fullPool = [];

  // 只取出新生成的 entries（在 lengthBefore 之後的）
  var newEntries = fullPool.slice(lengthBefore);

  // 也回傳最新的 ownedHeroIds（可能因 gacha-pull 新增了英雄）
  var heroes = readHeroInstances_(playerId);
  var ownedHeroIds = [];
  for (var oi = 0; oi < heroes.length; oi++) {
    var hid = Number(heroes[oi].heroId);
    if (hid && ownedHeroIds.indexOf(hid) === -1) ownedHeroIds.push(hid);
  }

  return {
    success: true,
    newEntries: newEntries,
    newEntriesCount: newEntries.length,
    serverPoolTotal: fullPool.length,
    ownedHeroIds: ownedHeroIds,
    diamond: Number(saveData.diamond) || 0
  };
}

/**
 * 重置 gacha pool（清除所有 entries，強制下次 initSave/refill 時從 gachaPity 重新生成）
 * 用於 QA 測試前清理舊的被汙染 pool
 */
function handleResetGachaPool_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'save_not_found' };

  // 重置 gachaPity 為 0（乾淨起點）
  var gachaPity = { pullsSinceLastSSR: 0, guaranteedFeatured: false };
  ensureColumn_(saveSheet, 'gachaPity');
  writeCell_(saveSheet, saveRow, 'gachaPity', JSON.stringify(gachaPity));

  // 清空 pool 並以 gachaPity（=0）為 poolEndPity 重新生成
  ensureColumn_(saveSheet, 'gachaPool');
  ensureColumn_(saveSheet, 'gachaPoolEndPity');
  writeCell_(saveSheet, saveRow, 'gachaPool', '[]');
  writeCell_(saveSheet, saveRow, 'gachaPoolEndPity', JSON.stringify(gachaPity));

  // 重新讀取 saveData 後生成新 pool
  var saveData = readRow_(saveSheet, saveRow);
  var poolInfo = ensureGachaPool_(playerId, saveData, saveSheet, saveRow);

  return {
    success: true,
    poolGenerated: poolInfo.remaining,
    startPity: gachaPity
  };
}

// ═══════════════════════════════════════════════════════
// Mailbox System
// ═══════════════════════════════════════════════════════

var MAIL_HEADERS_ = [
  'mailId','playerId','title','body','rewards','claimed','read','createdAt','expiresAt','deletedAt'
];

function getMailSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('mailbox');
  if (!sheet) {
    sheet = ss.insertSheet('mailbox');
    sheet.getRange(1, 1, 1, MAIL_HEADERS_.length).setValues([MAIL_HEADERS_]);
  }
  return sheet;
}

/** 取得玩家的所有有效信件(未刪除、未過期) */
function getPlayerMails_(sheet, playerId) {
  if (sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var now = new Date().toISOString();

  var mails = [];
  for (var i = 0; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    row._rowIndex = i + 2; // 1-based sheet row

    // Filter: belongs to player (or broadcast) + not deleted + not expired
    var pid = String(row.playerId || '').toUpperCase();
    var pidMatch = String(playerId).toUpperCase();
    if (pid !== pidMatch && pid !== '*') continue;
    if (row.deletedAt) continue;
    if (row.expiresAt && String(row.expiresAt) < now) continue;

    mails.push(row);
  }

  // Sort: unread first, then newest first
  mails.sort(function(a, b) {
    var aRead = (a.read === true || a.read === 'true') ? 1 : 0;
    var bRead = (b.read === true || b.read === 'true') ? 1 : 0;
    if (aRead !== bRead) return aRead - bRead;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });

  return mails;
}

/** 載入信件 */
function handleLoadMail_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var sheet = getMailSheet_();
  var mails = getPlayerMails_(sheet, playerId);

  var unreadCount = 0;
  var result = mails.map(function(m) {
    var isRead = (m.read === true || m.read === 'true');
    if (!isRead) unreadCount++;
    var rewards = [];
    try { rewards = JSON.parse(m.rewards || '[]'); } catch(e) { rewards = []; }
    return {
      mailId: String(m.mailId),
      title: String(m.title || ''),
      body: String(m.body || ''),
      rewards: rewards,
      claimed: (m.claimed === true || m.claimed === 'true'),
      read: isRead,
      createdAt: String(m.createdAt || ''),
      expiresAt: m.expiresAt ? String(m.expiresAt) : null
    };
  });

  return { success: true, mails: result, unreadCount: unreadCount };
}

/** 標記已讀 */
function handleReadMail_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var sheet = getMailSheet_();
  var mails = getPlayerMails_(sheet, playerId);
  var mail = mails.filter(function(m) { return String(m.mailId) === params.mailId; })[0];
  if (!mail) return { success: false, error: 'mail_not_found' };

  writeCell_(sheet, mail._rowIndex, 'read', true);
  return { success: true };
}

/** 領取單封獎勵 */
function handleClaimMailReward_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  return executeWithIdempotency_(params.opId, playerId, 'claim-mail-reward', function() {
    var sheet = getMailSheet_();
    var mails = getPlayerMails_(sheet, playerId);
    var mail = mails.filter(function(m) { return String(m.mailId) === params.mailId; })[0];
    if (!mail) return { success: false, error: 'mail_not_found' };
    if (mail.claimed === true || mail.claimed === 'true') return { success: false, error: 'already_claimed' };

    var rewards = [];
    try { rewards = JSON.parse(mail.rewards || '[]'); } catch(e) { rewards = []; }
    if (rewards.length === 0) return { success: false, error: 'no_rewards' };

    grantRewards_(playerId, rewards);

    writeCell_(sheet, mail._rowIndex, 'claimed', true);
    writeCell_(sheet, mail._rowIndex, 'read', true);
    return { success: true, rewards: rewards };
  });
}

/** 一鍵領取全部 */
function handleClaimAllMail_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  return executeWithIdempotency_(params.opId, playerId, 'claim-all-mail', function() {
    var sheet = getMailSheet_();
    var mails = getPlayerMails_(sheet, playerId);

    var claimedCount = 0;
    var totalRewardsMap = {};

    for (var i = 0; i < mails.length; i++) {
      var m = mails[i];
      if (m.claimed === true || m.claimed === 'true') continue;
      var rewards = [];
      try { rewards = JSON.parse(m.rewards || '[]'); } catch(e) { rewards = []; }
      if (rewards.length === 0) continue;

      grantRewards_(playerId, rewards);
      writeCell_(sheet, m._rowIndex, 'claimed', true);
      writeCell_(sheet, m._rowIndex, 'read', true);
      claimedCount++;

      for (var j = 0; j < rewards.length; j++) {
        var r = rewards[j];
        totalRewardsMap[r.itemId] = (totalRewardsMap[r.itemId] || 0) + (r.quantity || 0);
      }
    }

    var totalRewards = [];
    for (var key in totalRewardsMap) {
      totalRewards.push({ itemId: key, quantity: totalRewardsMap[key] });
    }

    return { success: true, claimedCount: claimedCount, totalRewards: totalRewards };
  });
}

/** 刪除信件 */
function handleDeleteMail_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var sheet = getMailSheet_();
  var mails = getPlayerMails_(sheet, playerId);
  var mail = mails.filter(function(m) { return String(m.mailId) === params.mailId; })[0];
  if (!mail) return { success: false, error: 'mail_not_found' };

  // 不可刪除含未領取獎勵的信件
  var rewards = [];
  try { rewards = JSON.parse(mail.rewards || '[]'); } catch(e) { rewards = []; }
  if (rewards.length > 0 && !(mail.claimed === true || mail.claimed === 'true')) {
    return { success: false, error: 'has_unclaimed_rewards' };
  }

  writeCell_(sheet, mail._rowIndex, 'deletedAt', new Date().toISOString());
  return { success: true };
}

/** 刪除所有已讀+已領取 */
function handleDeleteAllRead_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var sheet = getMailSheet_();
  var mails = getPlayerMails_(sheet, playerId);
  var deletedCount = 0;
  var now = new Date().toISOString();

  for (var i = 0; i < mails.length; i++) {
    var m = mails[i];
    var isRead = (m.read === true || m.read === 'true');
    if (!isRead) continue;

    var rewards = [];
    try { rewards = JSON.parse(m.rewards || '[]'); } catch(e) { rewards = []; }
    var isClaimed = (m.claimed === true || m.claimed === 'true');
    if (rewards.length > 0 && !isClaimed) continue;

    writeCell_(sheet, m._rowIndex, 'deletedAt', now);
    deletedCount++;
  }

  return { success: true, deletedCount: deletedCount };
}

/** 發送信件（管理用） */
function handleSendMail_(params) {
  // 簡易管理驗證（可升級為更安全的方式）
  // 允許從 GAS 內部直接呼叫（無 adminKey 驗證時視為內部呼叫）

  var targetIds = params.targetPlayerIds || [];
  var title = String(params.title || '').substring(0, 50);
  var body = String(params.body || '').substring(0, 500);
  var rewards = params.rewards || [];
  var expiresAt = params.expiresAt || '';
  var now = new Date().toISOString();

  var sheet = getMailSheet_();
  var rows = [];

  for (var i = 0; i < targetIds.length; i++) {
    var mailId = Utilities.getUuid();
    // 正規化 playerId 為大寫（與 Players sheet 一致）
    var normalizedPid = String(targetIds[i]).toUpperCase();
    rows.push([
      mailId, normalizedPid, title, body, JSON.stringify(rewards),
      false, false, now, expiresAt, ''
    ]);
  }

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, MAIL_HEADERS_.length).setValues(rows);
  }

  return { success: true, sentCount: rows.length };
}

/**
 * 領取 PWA 安裝獎勵（每帳號一次）
 * POST { action: "claim-pwa-reward", guestToken }
 */
function handleClaimPwaReward_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };

  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return { success: false, error: 'no_save_data' };

  // 確保欄位存在
  ensureColumn_(saveSheet, 'pwaRewardClaimed');

  // 檢查是否已領取
  var claimed = readCell_(saveSheet, saveRow, 'pwaRewardClaimed');
  if (claimed === true || claimed === 'true' || claimed === 'TRUE') {
    return { success: false, error: 'already_claimed' };
  }

  // 標記已領取
  writeCell_(saveSheet, saveRow, 'pwaRewardClaimed', true);

  // 發送獎勵信件
  try {
    handleSendMail_({
      targetPlayerIds: [playerId],
      title: '📱 加入主畫面獎勵',
      body: '感謝將全球感染加入主畫面！享受更快的載入速度與更穩定的遊戲體驗。這是您的安裝獎勵！',
      rewards: [
        { itemId: 'diamond', quantity: 100 },
        { itemId: 'gold', quantity: 3000 }
      ],
      expiresAt: ''
    });
  } catch (e) {
    Logger.log('PWA reward mail failed for ' + playerId + ': ' + e.message);
  }

  return { success: true, message: 'PWA 安裝獎勵已發送' };
}

/** 發放獎勵到玩家帳號 */
function grantRewards_(playerId, rewards) {
  var saveSheet = getSaveSheet_();
  var saveRow = findRowByColumn_(saveSheet, 'playerId', playerId);
  if (saveRow === 0) return;

  for (var i = 0; i < rewards.length; i++) {
    var r = rewards[i];
    var itemId = String(r.itemId || '');
    var qty = Number(r.quantity || 0);
    if (!itemId || qty <= 0) continue;

    if (itemId === 'diamond') {
      var curDiamond = Number(readCell_(saveSheet, saveRow, 'diamond') || 0);
      writeCell_(saveSheet, saveRow, 'diamond', curDiamond + qty);
    } else if (itemId === 'gold') {
      var curGold = Number(readCell_(saveSheet, saveRow, 'gold') || 0);
      writeCell_(saveSheet, saveRow, 'gold', curGold + qty);
    } else {
      // 一般道具 → inventory via upsertItem_
      upsertItem_(playerId, itemId, qty);
    }
  }
}

/** 讀取單一儲存格值 */
function readCell_(sheet, rowNum, colName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = headers.indexOf(colName);
  if (colIdx === -1) return '';
  return sheet.getRange(rowNum, colIdx + 1).getValue();
}

// ═══════════════════════════════════════════════════════
// Optimistic Queue — 冪等操作支援
// ═══════════════════════════════════════════════════════

var OP_LOG_HEADERS_ = ['opId', 'playerId', 'action', 'result', 'createdAt'];

function getOpLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('op_log');
  if (!sheet) {
    sheet = ss.insertSheet('op_log');
    sheet.getRange(1, 1, 1, OP_LOG_HEADERS_.length).setValues([OP_LOG_HEADERS_]);
  }
  return sheet;
}

/**
 * 檢查 opId 是否已經處理過
 * @returns {Object|null} cached result 或 null
 */
function checkOpProcessed_(opId) {
  if (!opId) return null;
  var sheet = getOpLogSheet_();
  if (sheet.getLastRow() <= 1) return null;
  var row = findRowByColumn_(sheet, 'opId', opId);
  if (row === 0) return null;
  var data = readRow_(sheet, row);
  try { return JSON.parse(data.result); } catch(e) { return { success: true }; }
}

/**
 * 記錄已處理的 opId 及其結果
 */
function recordOpProcessed_(opId, playerId, action, result) {
  if (!opId) return;
  var sheet = getOpLogSheet_();
  sheet.appendRow([
    opId,
    playerId,
    action,
    JSON.stringify(result),
    new Date().toISOString()
  ]);
}

/**
 * 帶冪等鍵的操作執行器
 * 若 opId 已處理 → 直接回傳快取結果
 * 若未處理 → 執行 handler → 記錄結果
 */
function executeWithIdempotency_(opId, playerId, action, handler) {
  if (opId) {
    var cached = checkOpProcessed_(opId);
    if (cached) return cached;
  }
  var result = handler();
  if (opId && result && result.success) {
    recordOpProcessed_(opId, playerId, action, result);
  }
  return result;
}

/**
 * 檢查單一操作是否已完成
 * POST { action: "check-op", guestToken, opId }
 */
function handleCheckOp_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var opId = params.opId;
  if (!opId) return { success: false, error: 'missing_opId' };
  var cached = checkOpProcessed_(opId);
  return { success: true, processed: !!cached, cachedResult: cached || null };
}

/**
 * 批次補償未完成的操作
 * POST { action: "reconcile-pending", guestToken, ops: [{ opId, action, params }] }
 */
function handleReconcilePending_(params) {
  var playerId = resolvePlayerId_(params.guestToken);
  if (!playerId) return { success: false, error: 'invalid_token' };
  var ops = params.ops;
  if (!Array.isArray(ops) || ops.length === 0) return { success: true, results: [] };

  var results = [];
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    var opId = op.opId;

    // 先檢查是否已處理
    var cached = checkOpProcessed_(opId);
    if (cached) {
      results.push({ opId: opId, status: 'already_processed', result: cached });
      continue;
    }

    // 嘗試執行
    try {
      // 重建完整 params（加回 guestToken）
      var fullParams = op.params || {};
      fullParams.guestToken = params.guestToken;
      fullParams.opId = opId;
      var opResult;

      switch (op.action) {
        case 'collect-resources':
          opResult = handleCollectResources_(fullParams);
          break;
        case 'claim-mail-reward':
          opResult = handleClaimMailReward_(fullParams);
          break;
        case 'claim-all-mail':
          opResult = handleClaimAllMail_(fullParams);
          break;
        case 'gacha-pull':
          opResult = handleGachaPull_(fullParams);
          break;
        case 'complete-stage':
          opResult = handleCompleteStage_(fullParams);
          break;
        case 'complete-tower':
          opResult = handleCompleteTower_(fullParams);
          break;
        case 'complete-daily':
          opResult = handleCompleteDaily_(fullParams);
          break;
        default:
          opResult = { success: false, error: 'unsupported_action: ' + op.action };
      }

      if (opResult && opResult.success) {
        recordOpProcessed_(opId, playerId, op.action, opResult);
      }
      results.push({ opId: opId, status: 'executed', result: opResult });
    } catch (e) {
      results.push({ opId: opId, status: 'error', error: e.message });
    }
  }

  return { success: true, results: results };
}
