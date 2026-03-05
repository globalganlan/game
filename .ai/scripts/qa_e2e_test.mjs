/**
 * QA E2E Test — 端對端遊戲流程驗證
 * 
 * 測試項目：
 * 1. 登入畫面載入
 * 2. 進入主選單
 * 3. 主選單各功能按鈕存在
 * 4. 召喚（Gacha）流程
 * 5. 英雄列表
 * 6. 背包 UI
 * 7. 商店 UI
 * 8. 關卡選擇（含 PvP、Boss）
 * 9. JS 錯誤收集
 */

import puppeteer from 'puppeteer'

const PORT = process.env.QA_PORT || '5175'
const TOKEN = 'aedc3705-6706-4db5-8d53-41488c5f1598'
const BASE = `http://localhost:${PORT}/game/`
const results = []
const jsErrors = []

function log(tag, msg) {
  const line = `[${tag}] ${msg}`
  console.log(line)
  results.push(line)
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-web-security'],
  timeout: 60000
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })

// Set guest token
await page.evaluateOnNewDocument((t) => {
  localStorage.setItem('globalganlan_guest_token', t)
}, TOKEN)

// Collect errors
page.on('pageerror', e => jsErrors.push(e.message))
page.on('console', m => {
  if (m.type() === 'error') jsErrors.push(m.text())
})

// --- 1. Navigate to game ---
log('NAV', `Opening ${BASE}`)
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await new Promise(r => setTimeout(r, 8000))

// --- 2. Login screen check ---
const loginText = await page.evaluate(() => document.body.innerText)
const hasLoginUI = loginText.includes('訪客') || loginText.includes('登入') || loginText.includes('進入') || loginText.includes('Guest')
log('LOGIN', hasLoginUI ? '✅ 登入畫面正常顯示' : '⚠️ 未偵測到登入畫面')

// Get all buttons
const allBtnTexts = await page.$$eval('button', bs => bs.map(b => b.textContent?.trim()).filter(Boolean))
log('BTN', `登入畫面按鈕: ${JSON.stringify(allBtnTexts)}`)

// --- 3. Click enter button ---
let clicked = false
for (const btn of await page.$$('button')) {
  const txt = await page.evaluate(el => el.textContent?.trim(), btn)
  if (txt && (txt.includes('進入') || txt.includes('開始') || txt.includes('Play') || txt.includes('遊戲'))) {
    log('CLICK', `點擊: ${txt}`)
    await btn.click()
    clicked = true
    break
  }
}
if (!clicked) log('CLICK', '⚠️ 找不到進入按鈕')

// --- 4. Wait for loading + main menu ---
const deadline = Date.now() + 120000
let mainMenuReached = false
while (Date.now() < deadline) {
  const txt = await page.evaluate(() => document.body.innerText)
  if (txt.includes('關卡') || txt.includes('召喚') || txt.includes('背包') || txt.includes('英雄')) {
    mainMenuReached = true
    break
  }
  const pctMatch = txt.match(/(\d+)%/)
  if (pctMatch) process.stdout.write(`\rLoading: ${pctMatch[1]}%`)
  await new Promise(r => setTimeout(r, 3000))
}
log('MENU', mainMenuReached ? '✅ 成功進入主選單' : '❌ 等待主選單超時')

if (!mainMenuReached) {
  const body = await page.evaluate(() => document.body.innerText)
  log('DEBUG', `頁面文字(500): ${body.substring(0, 500)}`)
  await browser.close()
  process.exit(1)
}

// --- 5. Main menu items check ---
await new Promise(r => setTimeout(r, 3000))
const menuText = await page.evaluate(() => document.body.innerText)
const menuBtns = await page.$$eval('button', bs => bs.map(b => b.textContent?.trim()).filter(Boolean))
log('MENU-BTN', `主選單按鈕: ${JSON.stringify(menuBtns)}`)

const expected = ['關卡', '召喚', '背包', '英雄', '商店']
for (const item of expected) {
  const found = menuBtns.some(b => b.includes(item)) || menuText.includes(item)
  log('MENU', `${item}: ${found ? '✅' : '❌ 未找到'}`)
}

// Check 關卡進度
const progressMatch = menuText.match(/關卡進度[：:]\s*(\S+)/)
log('PROGRESS', progressMatch ? `關卡進度: ${progressMatch[1]}` : '⚠️ 關卡進度未顯示')

// Check undefined leak
const hasUndef = menuText.includes('undefined') || menuText.includes('NaN')
log('SANITY', hasUndef ? '⚠️ 頁面中有 undefined/NaN' : '✅ 無 undefined/NaN')

// --- 6. Test Hero List ---
try {
  const heroBtn = menuBtns.findIndex(t => t.includes('英雄'))
  if (heroBtn >= 0) {
    const btns = await page.$$('button')
    await btns[heroBtn].click()
    await new Promise(r => setTimeout(r, 2000))
    const heroText = await page.evaluate(() => document.body.innerText)
    const hasHeroList = heroText.includes('HP') || heroText.includes('ATK') || heroText.includes('攻擊') || heroText.includes('Lv')
    log('HERO', hasHeroList ? '✅ 英雄列表正常' : '⚠️ 英雄列表內容異常')
    // Go back
    const backBtn = await page.$('.hero-list-close, .panel-close, [class*="close"]')
    if (backBtn) await backBtn.click()
    else {
      // Try press Escape
      await page.keyboard.press('Escape')
    }
    await new Promise(r => setTimeout(r, 1000))
  }
} catch (e) {
  log('HERO', `❌ 錯誤: ${e.message}`)
}

// --- 7. Test Gacha ---
try {
  const menuBtns2 = await page.$$eval('button', bs => bs.map(b => b.textContent?.trim()).filter(Boolean))
  const gachaIdx = menuBtns2.findIndex(t => t.includes('召喚'))
  if (gachaIdx >= 0) {
    const btns = await page.$$('button')
    await btns[gachaIdx].click()
    await new Promise(r => setTimeout(r, 2000))
    const gachaText = await page.evaluate(() => document.body.innerText)
    const hasGachaUI = gachaText.includes('單抽') || gachaText.includes('十連') || gachaText.includes('召喚')
    log('GACHA', hasGachaUI ? '✅ 召喚介面正常' : '⚠️ 召喚介面異常')
    
    // Try single pull
    const pullBtn = await page.$('.gacha-pull-single')
    if (pullBtn) {
      const disabled = await page.evaluate(el => el.disabled, pullBtn)
      log('GACHA', disabled ? '⚠️ 單抽按鈕禁用（鑽石不足？）' : '💎 單抽按鈕可用')
    }
    
    // Go back
    const backBtn = await page.$('[class*="back"], [class*="close"]')
    if (backBtn) await backBtn.click()
    else await page.keyboard.press('Escape')
    await new Promise(r => setTimeout(r, 1000))
  }
} catch (e) {
  log('GACHA', `❌ 錯誤: ${e.message}`)
}

// --- 8. Test Shop ---
try {
  const menuBtns3 = await page.$$eval('button', bs => bs.map(b => b.textContent?.trim()).filter(Boolean))
  const shopIdx = menuBtns3.findIndex(t => t.includes('商店'))
  if (shopIdx >= 0) {
    const btns = await page.$$('button')
    await btns[shopIdx].click()
    await new Promise(r => setTimeout(r, 2000))
    const shopText = await page.evaluate(() => document.body.innerText)
    const hasShopUI = shopText.includes('購買') || shopText.includes('道具') || shopText.includes('金幣')
    log('SHOP', hasShopUI ? '✅ 商店介面正常' : '⚠️ 商店介面異常')
    log('SHOP-TEXT', `商店文字(200): ${shopText.substring(0, 200)}`)
    // Go back
    await page.keyboard.press('Escape')
    await new Promise(r => setTimeout(r, 1000))
  } else {
    log('SHOP', '⚠️ 未找到商店按鈕')
  }
} catch (e) {
  log('SHOP', `❌ 錯誤: ${e.message}`)
}

// --- 9. Test Inventory ---
try {
  const menuBtns4 = await page.$$eval('button', bs => bs.map(b => b.textContent?.trim()).filter(Boolean))
  const invIdx = menuBtns4.findIndex(t => t.includes('背包'))
  if (invIdx >= 0) {
    const btns = await page.$$('button')
    await btns[invIdx].click()
    await new Promise(r => setTimeout(r, 3000))
    const invText = await page.evaluate(() => document.body.innerText)
    const hasInvUI = invText.includes('裝備') || invText.includes('素材') || invText.includes('道具') || invText.includes('全部')
    log('INV', hasInvUI ? '✅ 背包介面正常' : '⚠️ 背包介面異常')
    // Go back
    await page.keyboard.press('Escape')
    await new Promise(r => setTimeout(r, 1000))
  }
} catch (e) {
  log('INV', `❌ 錯誤: ${e.message}`)
}

// --- 10. Test Stage Select ---
try {
  const menuBtns5 = await page.$$eval('button', bs => bs.map(b => b.textContent?.trim()).filter(Boolean))
  const stageIdx = menuBtns5.findIndex(t => t.includes('關卡'))
  if (stageIdx >= 0) {
    const btns = await page.$$('button')
    await btns[stageIdx].click()
    await new Promise(r => setTimeout(r, 2000))
    const stageText = await page.evaluate(() => document.body.innerText)
    const hasTabs = stageText.includes('主線') || stageText.includes('爬塔') || stageText.includes('PvP') || stageText.includes('Boss')
    log('STAGE', hasTabs ? '✅ 關卡選擇介面正常' : '⚠️ 關卡選擇異常')
    
    // Check PvP tab
    const tabBtns = await page.$$eval('button', bs => bs.map(b => b.textContent?.trim()).filter(Boolean))
    const pvpTab = tabBtns.findIndex(t => t.includes('PvP') || t.includes('競技'))
    log('STAGE', pvpTab >= 0 ? '✅ PvP 頁籤存在' : '⚠️ PvP 頁籤未找到')
    
    const bossTab = tabBtns.findIndex(t => t.includes('Boss') || t.includes('首領'))
    log('STAGE', bossTab >= 0 ? '✅ Boss 頁籤存在' : '⚠️ Boss 頁籤未找到')
    
    // Go back
    await page.keyboard.press('Escape')
    await new Promise(r => setTimeout(r, 1000))
  }
} catch (e) {
  log('STAGE', `❌ 錯誤: ${e.message}`)
}

// --- 11. Test Settings ---
try {
  const menuBtns6 = await page.$$eval('button', bs => bs.map(b => b.textContent?.trim()).filter(Boolean))
  const setIdx = menuBtns6.findIndex(t => t.includes('設定') || t.includes('⚙'))
  if (setIdx >= 0) {
    const btns = await page.$$('button')
    await btns[setIdx].click()
    await new Promise(r => setTimeout(r, 2000))
    const setText = await page.evaluate(() => document.body.innerText)
    const hasAudio = setText.includes('音量') || setText.includes('BGM') || setText.includes('SFX') || setText.includes('音效')
    log('SETTINGS', hasAudio ? '✅ 音效設定正常' : '⚠️ 音效設定未找到')
    await page.keyboard.press('Escape')
    await new Promise(r => setTimeout(r, 1000))
  }
} catch (e) {
  log('SETTINGS', `❌ 錯誤: ${e.message}`)
}

// --- Final: JS errors ---
const gameErrors = jsErrors.filter(e =>
  !e.includes('WebGL') &&
  !e.includes('favicon') &&
  !e.includes('404') &&
  !e.includes('net::ERR') &&
  !e.includes('CORS') &&
  !e.includes('draco')
)
log('ERRORS', gameErrors.length > 0
  ? `❌ ${gameErrors.length} JS 錯誤:\n  ${gameErrors.slice(0, 10).join('\n  ')}`
  : '✅ 無重大 JS 錯誤'
)

await browser.close()

// --- Summary ---
console.log('\n════════════════════════════════')
console.log('  QA E2E 測試結果摘要')
console.log('════════════════════════════════')
const pass = results.filter(r => r.includes('✅')).length
const warn = results.filter(r => r.includes('⚠️')).length
const fail = results.filter(r => r.includes('❌')).length
console.log(`✅ 通過: ${pass}  ⚠️ 警告: ${warn}  ❌ 失敗: ${fail}`)
console.log('════════════════════════════════')
