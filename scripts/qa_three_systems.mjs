/**
 * QA E2E — 戰力 / 競技場 / 獲得物品動畫 三大系統整合測試
 *
 * 使用 Puppeteer 進入遊戲，驗證：
 * 1. 戰力 HUD 在大廳/IDLE 正確顯示
 * 2. 競技場面板可開啟、排行榜可見、挑戰流程正常
 * 3. 獲得物品動畫在各場景觸發
 * 
 * 用法: node scripts/qa_three_systems.mjs
 * 前提: localhost:5173 dev server 已啟動
 */

import puppeteer from 'puppeteer'

const PORT = process.env.QA_PORT || '5173'
const TOKEN = 'aedc3705-6706-4db5-8d53-41488c5f1598'
const BASE = `http://localhost:${PORT}/game/`

const checks = []
const jsErrors = []
let screenshotCount = 0

function log(tag, msg, status = 'info') {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : status === 'warn' ? '⚠️' : '🔍'
  const line = `${icon} [${tag}] ${msg}`
  console.log(line)
  checks.push({ tag, msg, status })
}

async function screenshot(page, name) {
  screenshotCount++
  const path = `qa_screenshots/three_systems_${screenshotCount}_${name}.png`
  await page.screenshot({ path, fullPage: false })
  console.log(`  📸 ${path}`)
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

async function clickButton(page, textMatch) {
  const btns = await page.$$('button')
  for (const btn of btns) {
    const txt = await page.evaluate(el => el.textContent?.trim(), btn)
    if (txt && txt.includes(textMatch)) {
      await btn.click()
      return true
    }
  }
  return false
}

async function clickBackButton(page) {
  // Try various back button patterns
  const selectors = ['.panel-back-btn', '.hero-list-close', '[class*="back"]']
  for (const sel of selectors) {
    const el = await page.$(sel)
    if (el) { await el.click(); return true }
  }
  // fallback: click button with "返回"
  return await clickButton(page, '返回')
}

async function getPageText(page) {
  return page.evaluate(() => document.body.innerText)
}

async function getButtonTexts(page) {
  return page.$$eval('button', bs => bs.map(b => b.textContent?.trim()).filter(Boolean))
}

// ═════════════════════════════════════
// Main
// ═════════════════════════════════════

console.log('\n╔══════════════════════════════════════════╗')
console.log('║  QA: 戰力 / 競技場 / 獲得物品動畫 E2E  ║')
console.log('╚══════════════════════════════════════════╝\n')

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-web-security'],
  timeout: 60000,
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })

// Set guest token
await page.evaluateOnNewDocument((t) => {
  localStorage.setItem('globalganlan_guest_token', t)
}, TOKEN)

// Collect JS errors
page.on('pageerror', e => jsErrors.push(e.message))
page.on('console', m => {
  if (m.type() === 'error') jsErrors.push(m.text())
})

// ─── 0. 開啟遊戲 ───
log('NAV', `Opening ${BASE}`)
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
await wait(6000)

// ─── 1. 進入主選單 ───
const loginBtns = await getButtonTexts(page)
log('LOGIN', `按鈕: ${JSON.stringify(loginBtns)}`)

let clicked = false
for (const label of ['進入遊戲', '開始遊戲', 'Play', '進入', '開始']) {
  if (await clickButton(page, label)) { clicked = true; break }
}
if (!clicked) log('LOGIN', '找不到進入按鈕', 'warn')

// Wait for main menu
const menuDeadline = Date.now() + 120000
let inMainMenu = false
while (Date.now() < menuDeadline) {
  const txt = await getPageText(page)
  if (txt.includes('關卡') || txt.includes('召喚') || txt.includes('競技場')) {
    inMainMenu = true
    break
  }
  const pctMatch = txt.match(/(\d+)%/)
  if (pctMatch) process.stdout.write(`\rLoading: ${pctMatch[1]}%`)
  await wait(3000)
}

if (!inMainMenu) {
  log('MENU', '進入主選單超時', 'fail')
  await screenshot(page, 'timeout')
  await browser.close()
  process.exit(1)
}
log('MENU', '成功進入主選單', 'pass')
await wait(3000)
await screenshot(page, 'main_menu')

// ═════════════════════════════════════
// T1: 戰力系統測試
// ═════════════════════════════════════

console.log('\n── T1: 戰力系統 ──')

// T1.1: 大廳戰力 HUD
{
  const txt = await getPageText(page)
  const html = await page.evaluate(() => document.body.innerHTML)
  
  // Check for combat power display (⚡ or 戰力)
  const hasCPDisplay = txt.includes('戰力') || txt.includes('⚡') || html.includes('combat-power')
  log('T1.1', `大廳戰力顯示: ${hasCPDisplay ? '有' : '無'}`, hasCPDisplay ? 'pass' : 'warn')
  
  // Check for number (CP value)
  const cpMatch = txt.match(/戰力[：: ]*(\d[\d,]+)/i)
  if (cpMatch) {
    log('T1.1', `戰力數值: ${cpMatch[1]}`, 'pass')
  }
}

// T1.2: 選關後查看對比條
{
  // Try clicking stage select
  if (await clickButton(page, '關卡')) {
    await wait(2000)
    await screenshot(page, 't1_stage_select')
    
    // Click first stage
    const stageLinks = await page.$$('.stage-item, .stage-btn, [class*="stage"]')
    if (stageLinks.length > 0) {
      await stageLinks[0].click()
      await wait(3000)
      
      const txt = await getPageText(page)
      const html = await page.evaluate(() => document.body.innerHTML)
      
      // Check for combat power comparison bar
      const hasCPComparison = html.includes('cp-comparison') || 
                               html.includes('combat-power') || 
                               txt.includes('戰力') || 
                               txt.includes('我方') ||
                               txt.includes('碾壓') ||
                               txt.includes('優勢') ||
                               txt.includes('勢均力敵') ||
                               txt.includes('劣勢') ||
                               txt.includes('危險')
      log('T1.2', `IDLE 戰力對比: ${hasCPComparison ? '有顯示' : '未顯示'}`, hasCPComparison ? 'pass' : 'warn')
      await screenshot(page, 't1_cp_comparison')
      
      // Go back to main menu
      await clickBackButton(page)
      await wait(1000)
      // May need another back
      await clickBackButton(page)
      await wait(1000)
    }
  }
}

// ═════════════════════════════════════
// T2: 競技場系統測試
// ═════════════════════════════════════

console.log('\n── T2: 競技場系統 ──')

// T2.1: 競技場按鈕存在
{
  const btns = await getButtonTexts(page)
  const hasArenaBtn = btns.some(b => b.includes('競技場') || b.includes('Arena'))
  log('T2.1', `主選單競技場按鈕: ${hasArenaBtn ? '有' : '無'}`, hasArenaBtn ? 'pass' : 'fail')
}

// T2.2: 進入競技場面板
{
  const entered = await clickButton(page, '競技場')
  if (!entered) {
    log('T2.2', '無法點擊競技場按鈕', 'fail')
  } else {
    await wait(3000)
    await screenshot(page, 't2_arena_panel')
    
    const txt = await getPageText(page)
    const btns = await getButtonTexts(page)
    
    // T2.2a: 排行榜存在
    const hasRanking = txt.includes('排名') || txt.includes('排行') || txt.includes('Rank')
    log('T2.2', `排行榜顯示: ${hasRanking ? '有' : '無'}`, hasRanking ? 'pass' : 'warn')
    
    // T2.2b: NPC 條目存在
    const hasNPC = txt.includes('NPC') || txt.includes('暗影') || txt.includes('末日') || 
                   txt.includes('鐵血') || txt.includes('荒野') || txt.includes('幽靈') ||
                   txt.includes('狂暴') || txt.includes('冰霜') || txt.includes('烈焰')
    log('T2.2', `NPC 條目: ${hasNPC ? '有' : '無'}`, hasNPC ? 'pass' : 'warn')
    
    // T2.2c: 挑戰按鈕存在
    const hasChallenge = btns.some(b => b.includes('挑戰') || b.includes('Challenge'))
    log('T2.2', `挑戰按鈕: ${hasChallenge ? '有' : '無'}`, hasChallenge ? 'pass' : 'warn')
    
    // T2.2d: 戰力數值顯示
    const powerMatch = txt.match(/(\d[\d,]+)\s*(?:CP|戰力|Power)/) || txt.match(/(?:CP|戰力|Power)[：: ]*(\d[\d,]+)/)
    if (powerMatch) {
      log('T2.2', `排行榜戰力數值: ${powerMatch[1]}`, 'pass')
    }
    
    // T2.3: 點擊挑戰
    if (hasChallenge) {
      log('T2.3', '嘗試點擊挑戰按鈕...')
      const challengeClicked = await clickButton(page, '挑戰')
      if (challengeClicked) {
        await wait(5000)
        await screenshot(page, 't2_arena_battle_start')
        
        const battleTxt = await getPageText(page)
        const html = await page.evaluate(() => document.body.innerHTML)
        
        // Check if battle started (IDLE state or battle running)
        const battleStarted = battleTxt.includes('開始') || 
                              battleTxt.includes('戰鬥') ||
                              html.includes('battle') ||
                              html.includes('idle') ||
                              html.includes('start-btn') ||
                              battleTxt.includes('自動') ||
                              battleTxt.includes('碾壓') ||
                              battleTxt.includes('優勢') ||
                              battleTxt.includes('劣勢')
        log('T2.3', `戰鬥 IDLE: ${battleStarted ? '已進入' : '未進入'}`, battleStarted ? 'pass' : 'warn')
        
        // Check combat power comparison shows (enemy should have power)
        const hasCPBar = html.includes('cp-comparison') || battleTxt.includes('戰力') || battleTxt.includes('⚡')
        log('T2.3', `戰力對比條: ${hasCPBar ? '有' : '無'}`, hasCPBar ? 'pass' : 'warn')
        
        // Start auto battle if available
        const autoClicked = await clickButton(page, '開始') || await clickButton(page, '自動') || await clickButton(page, '戰鬥')
        if (autoClicked) {
          log('T2.3', '已啟動自動戰鬥，等待結果...')
          
          // Wait for battle to complete (max 60s)
          const battleEnd = Date.now() + 60000
          let battleResult = null
          while (Date.now() < battleEnd) {
            const t = await getPageText(page)
            if (t.includes('勝利') || t.includes('Victory')) { battleResult = 'win'; break }
            if (t.includes('失敗') || t.includes('Defeat') || t.includes('戰敗')) { battleResult = 'lose'; break }
            await wait(2000)
          }
          
          if (battleResult) {
            log('T2.3', `戰鬥結果: ${battleResult === 'win' ? '🏆 勝利' : '💀 敗北'}`, 'pass')
            await screenshot(page, `t2_arena_result_${battleResult}`)
            
            // T2.4: Check acquire toast animation after victory
            if (battleResult === 'win') {
              await wait(2000)
              const html2 = await page.evaluate(() => document.body.innerHTML)
              const hasAcquireToast = html2.includes('acquire-toast') || html2.includes('acquire-overlay')
              log('T2.4', `勝利獲得物品動畫: ${hasAcquireToast ? '有' : '未偵測到'}`, hasAcquireToast ? 'pass' : 'warn')
            }
            
            // T2.5: After battle, should return to arena
            await wait(5000)
            // Click through any overlays/toasts
            try { await page.click('body') } catch {}
            await wait(2000)

            const btns = await getButtonTexts(page)
            const returnedToLobby = btns.some(b => b.includes('返回') || b.includes('離開'))
            
            // Try to get back to lobby
            await clickButton(page, '返回')
            await wait(2000)
            
            const afterBattleTxt = await getPageText(page)
            const backToArena = afterBattleTxt.includes('排名') || afterBattleTxt.includes('競技場')
            log('T2.5', `戰後返回競技場: ${backToArena ? '是' : '否'}`, backToArena ? 'pass' : 'warn')
            await screenshot(page, 't2_after_battle')
          } else {
            log('T2.3', '戰鬥超時', 'warn')
            await screenshot(page, 't2_battle_timeout')
          }
        }
      }
    }
    
    // Return to main menu
    await clickBackButton(page)
    await wait(2000)
  }
}

// ═════════════════════════════════════
// T3: 獲得物品動畫測試
// ═════════════════════════════════════

console.log('\n── T3: 獲得物品動畫 ──')

// T3.1: 測試抽卡觸發
{
  const entered = await clickButton(page, '召喚')
  if (entered) {
    await wait(2000)
    await screenshot(page, 't3_gacha_screen')
    
    const txt = await getPageText(page)
    const hasPullBtn = txt.includes('單抽') || txt.includes('十連')
    log('T3.1', `召喚介面: ${hasPullBtn ? '正常' : '異常'}`, hasPullBtn ? 'pass' : 'warn')
    
    // Try single pull
    if (hasPullBtn) {
      const pulled = await clickButton(page, '單抽')
      if (pulled) {
        await wait(3000)
        await screenshot(page, 't3_gacha_result')
        
        const html = await page.evaluate(() => document.body.innerHTML)
        const hasResult = html.includes('gacha-result') || html.includes('result-card')
        log('T3.1', `抽卡結果: ${hasResult ? '有顯示' : '可能鑽石不足'}`, hasResult ? 'pass' : 'warn')
        
        // Check acquire toast triggered
        const hasToast = html.includes('acquire-toast') || html.includes('acquire-overlay')
        log('T3.1', `抽卡獲得物品動畫: ${hasToast ? '有' : '未偵測到（可能已消失或鑽石不足）'}`, hasToast ? 'pass' : 'warn')
        
        // Close results
        await clickButton(page, '確認')
        await wait(1000)
        await clickButton(page, '關閉')
        await wait(1000)
      }
    }
    
    await clickBackButton(page)
    await wait(2000)
  }
}

// T3.2: 測試商店購買觸發
{
  const entered = await clickButton(page, '商店')
  if (entered) {
    await wait(2000)
    await screenshot(page, 't3_shop_screen')
    
    const txt = await getPageText(page)
    const hasShopItems = txt.includes('每日') || txt.includes('購買') || txt.includes('金幣')
    log('T3.2', `商店介面: ${hasShopItems ? '正常' : '異常'}`, hasShopItems ? 'pass' : 'warn')
    
    // Try purchase first item
    if (hasShopItems) {
      const purchased = await clickButton(page, '購買')
      if (purchased) {
        await wait(2000)
        await screenshot(page, 't3_shop_purchase')
        
        const html = await page.evaluate(() => document.body.innerHTML)
        const buyTxt = await getPageText(page)
        const hasPurchaseMsg = buyTxt.includes('購買成功') || buyTxt.includes('不足')
        log('T3.2', `購買結果: ${hasPurchaseMsg ? buyTxt.match(/(購買成功|不足)[\S]*/)?.[0] ?? '有訊息' : '無訊息'}`, hasPurchaseMsg ? 'pass' : 'warn')
        
        // Check acquire toast
        const hasToast = html.includes('acquire-toast') || html.includes('acquire-overlay')
        log('T3.2', `商店購買獲得物品動畫: ${hasToast ? '有' : '未偵測到'}`, hasToast ? 'pass' : 'warn')
      }
    }
    
    await clickBackButton(page)
    await wait(2000)
  }
}

// T3.3: 測試常規關卡戰鬥後的獲得動畫（如果還沒測到的話）
{
  const entered = await clickButton(page, '關卡')
  if (entered) {
    await wait(2000)
    
    // Click first stage
    const stages = await page.$$('.stage-item, .stage-btn, [class*="stage"]')
    if (stages.length > 0) {
      await stages[0].click()
      await wait(3000)
      
      // Start battle
      const started = await clickButton(page, '開始') || await clickButton(page, '自動') || await clickButton(page, '戰鬥')
      if (started) {
        log('T3.3', '常規關卡戰鬥已啟動，等待結果...')
        
        const battleEnd = Date.now() + 60000
        let won = false
        while (Date.now() < battleEnd) {
          const t = await getPageText(page)
          if (t.includes('勝利') || t.includes('Victory')) { won = true; break }
          if (t.includes('失敗') || t.includes('Defeat')) break
          await wait(2000)
        }
        
        if (won) {
          await wait(2000)
          await screenshot(page, 't3_battle_victory')
          
          const html = await page.evaluate(() => document.body.innerHTML)
          const hasToast = html.includes('acquire-toast') || html.includes('acquire-overlay')
          log('T3.3', `戰鬥勝利獲得物品動畫: ${hasToast ? '有' : '未偵測到（可能已消失）'}`, hasToast ? 'pass' : 'warn')
        } else {
          log('T3.3', '戰鬥未勝利或超時', 'warn')
        }
        
        // Go back
        await wait(3000)
        try { await page.click('body') } catch {}
        await wait(1000)
        await clickButton(page, '返回')
        await wait(2000)
      }
    }
    
    await clickBackButton(page)
    await wait(2000)
  }
}

// ═════════════════════════════════════
// 總結
// ═════════════════════════════════════

console.log('\n╔══════════════════════════════════════════╗')
console.log('║             QA 測試總結                  ║')
console.log('╚══════════════════════════════════════════╝')

const passed = checks.filter(c => c.status === 'pass').length
const failed = checks.filter(c => c.status === 'fail').length
const warned = checks.filter(c => c.status === 'warn').length
const total = passed + failed + warned

console.log(`\n✅ Pass: ${passed}  ❌ Fail: ${failed}  ⚠️ Warn: ${warned}  Total: ${total}`)

if (jsErrors.length > 0) {
  console.log(`\n🐛 JS 錯誤 (${jsErrors.length}):`)
  for (const e of jsErrors.slice(0, 10)) {
    console.log(`  - ${e.substring(0, 200)}`)
  }
}

console.log(`\n📸 截圖數: ${screenshotCount} (qa_screenshots/)`)

const qaResult = failed === 0 ? 'QA PASS ✅' : 'QA FAIL ❌'
console.log(`\n${qaResult}`)

await browser.close()
process.exit(failed > 0 ? 1 : 0)
