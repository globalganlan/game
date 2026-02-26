/**
 * 一鍵更新 heroes 工作表 — 加入 DEF / CritRate / CritDmg / Element，移除舊 Passive / PassiveDesc
 *
 * 使用方式：
 * 1. 開啟你的 Google Sheets
 * 2. 擴充功能 → Apps Script
 * 3. 貼上此檔案內容，取代原有的 Code.gs（或新增一個檔案）
 * 4. 點上方 ▶ 執行「updateHeroesSchema」
 * 5. 第一次會要求授權，按「允許」
 * 6. 執行完畢後回到 Sheet 確認欄位已更新
 *
 * ⚠️ 只需執行一次！重複執行不會重複加欄位（有檢查機制）。
 */

function updateHeroesSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName('heroes') || ss.getSheets()[0]
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]

  Logger.log('現有欄位：' + headers.join(', '))

  // ── 1. 定義新欄位資料（依 spec hero-schema.md v2.0）──
  const heroData = {
    //         HeroID: [DEF, CritRate, CritDmg, Element]
    1:  [15, 5, 50, '闇'],   // 女喪屍
    2:  [20, 5, 50, '毒'],   // 異變者
    3:  [45, 5, 50, '闇'],   // 詭獸
    4:  [12, 15, 80, '火'],  // 屠宰者
    5:  [18, 5, 50, '毒'],   // 口器者
    6:  [20, 5, 50, '闇'],   // 無名活屍
    7:  [22, 5, 50, '毒'],   // 腐學者
    8:  [25, 5, 50, '闇'],   // 夜鬼
    9:  [20, 5, 50, '光'],   // 倖存者
    10: [14, 10, 60, '冰'],  // 童魘
    11: [16, 5, 50, '火'],   // 白面鬼
    12: [40, 5, 50, '雷'],   // 戰厄
    13: [30, 10, 70, '火'],  // 南瓜魔
    14: [10, 8, 50, '冰'],   // 脫逃者
  }

  // ── 2. 找 HeroID 欄位位置 ──
  const heroIdCol = headers.indexOf('HeroID')
  if (heroIdCol === -1) {
    throw new Error('找不到 HeroID 欄位！請確認工作表名稱為 "heroes" 且第一列有 HeroID')
  }

  // ── 3. 新增欄位（如果尚未存在）──
  const newCols = ['DEF', 'CritRate', 'CritDmg', 'Element']
  const colIndices = {} // { 'DEF': colNumber (1-based), ... }

  // 找 ATK 欄的位置，DEF 要插在 ATK 後面
  const atkColIdx = headers.indexOf('ATK')

  for (const colName of newCols) {
    const existing = headers.indexOf(colName)
    if (existing !== -1) {
      colIndices[colName] = existing + 1 // 1-based
      Logger.log('欄位 ' + colName + ' 已存在於第 ' + (existing + 1) + ' 欄')
    } else {
      // 新增到最後
      const newCol = sheet.getLastColumn() + 1
      sheet.getRange(1, newCol).setValue(colName)
      colIndices[colName] = newCol
      Logger.log('新增欄位 ' + colName + ' 於第 ' + newCol + ' 欄')
      // 更新 headers 陣列
      headers.push(colName)
    }
  }

  // ── 4. 填入資料 ──
  const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
  const allData = dataRange.getValues()
  const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]

  // 重新讀取正確的欄位位置
  const defCol = updatedHeaders.indexOf('DEF')
  const critRateCol = updatedHeaders.indexOf('CritRate')
  const critDmgCol = updatedHeaders.indexOf('CritDmg')
  const elementCol = updatedHeaders.indexOf('Element')
  const heroIdColFinal = updatedHeaders.indexOf('HeroID')

  for (let r = 0; r < allData.length; r++) {
    const heroId = Number(allData[r][heroIdColFinal])
    if (heroData[heroId]) {
      const [def, critRate, critDmg, element] = heroData[heroId]
      const row = r + 2 // 1-based + skip header

      if (defCol !== -1) sheet.getRange(row, defCol + 1).setValue(def)
      if (critRateCol !== -1) sheet.getRange(row, critRateCol + 1).setValue(critRate)
      if (critDmgCol !== -1) sheet.getRange(row, critDmgCol + 1).setValue(critDmg)
      if (elementCol !== -1) sheet.getRange(row, elementCol + 1).setValue(element)

      Logger.log('已更新 HeroID=' + heroId + ': DEF=' + def + ', CritRate=' + critRate + ', CritDmg=' + critDmg + ', Element=' + element)
    }
  }

  // ── 5. 標記舊欄位（可選：改名加上 [deprecated]）──
  const passiveCol = updatedHeaders.indexOf('Passive')
  const passiveDescCol = updatedHeaders.indexOf('PassiveDesc')

  if (passiveCol !== -1) {
    const currentName = sheet.getRange(1, passiveCol + 1).getValue()
    if (!String(currentName).includes('[deprecated]')) {
      sheet.getRange(1, passiveCol + 1).setValue('[deprecated] Passive')
      Logger.log('Passive 欄位已標記為 deprecated')
    }
  }
  if (passiveDescCol !== -1) {
    const currentName = sheet.getRange(1, passiveDescCol + 1).getValue()
    if (!String(currentName).includes('[deprecated]')) {
      sheet.getRange(1, passiveDescCol + 1).setValue('[deprecated] PassiveDesc')
      Logger.log('PassiveDesc 欄位已標記為 deprecated')
    }
  }

  // ── 6. 完成 ──
  SpreadsheetApp.flush()
  Logger.log('✅ 全部更新完成！共更新 ' + Object.keys(heroData).length + ' 個英雄')
  SpreadsheetApp.getUi().alert(
    '✅ 更新完成',
    '已新增 DEF / CritRate / CritDmg / Element 欄位，並填入 14 個英雄的數值。\n\n' +
    '舊的 Passive / PassiveDesc 欄位已標記 [deprecated]。\n' +
    '技能資料請另建 skill_templates 和 hero_skills 工作表。',
    SpreadsheetApp.getUi().ButtonSet.OK
  )
}
