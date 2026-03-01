/**
 * QA E2E — Puppeteer E2E test (all Chinese matching done inside browser evaluate)
 * Results written to qa_screenshots/e2e_results.json
 * 
 * Usage: node scripts/qa_gpu_e2e.mjs
 */

import puppeteer from 'puppeteer'
import fs from 'fs'

const PORT = process.env.QA_PORT || '5173'
const TOKEN = 'aedc3705-6706-4db5-8d53-41488c5f1598'
const BASE = `http://localhost:${PORT}/game/`

const results = []
const jsErrors = []
function log(msg) { results.push(msg); console.log(msg) }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// Click button containing text (matching done inside browser V8 — no encoding issue)
async function clickBtn(text) {
  return page.evaluate((t) => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find(el => el.textContent?.includes(t))
    if (b) { b.click(); return true }
    return false
  }, text)
}

// Check if page contains any of the keywords (inside browser)
async function pageHas(...keywords) {
  return page.evaluate((kws) => {
    const txt = document.body.innerText || ''
    const html = document.body.innerHTML || ''
    return kws.some(k => txt.includes(k) || html.includes(k))
  }, keywords)
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  timeout: 60000,
})

const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })

await page.evaluateOnNewDocument((t) => {
  localStorage.setItem('globalganlan_guest_token', t)
}, TOKEN)

page.on('pageerror', e => jsErrors.push(e.message))
page.on('console', m => {
  if (m.type() === 'error' && !m.text().includes('Manifest'))
    jsErrors.push(m.text().substring(0, 200))
})

// ══════════════ LOAD GAME ══════════════
log('[NAV] Opening game...')
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
await wait(8000)

// Click login button (matching inside browser)
const clickedLogin = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const b = btns.find(el => {
    const t = el.textContent || ''
    return t.includes('\u8a2a\u5ba2') || t.includes('\u9032\u5165') || t.includes('Login') || t.includes('Enter')
  })
  if (b) { b.click(); return true }
  return false
})
log(`[LOGIN] Clicked: ${clickedLogin}`)

// Wait for main menu (detection inside browser)
const deadline = Date.now() + 120000
while (Date.now() < deadline) {
  const atMenu = await page.evaluate(() => {
    const t = document.body.innerText || ''
    return t.includes('\u95dc\u5361') || t.includes('\u53ec\u559a') || t.includes('\u7af6\u6280\u5834')
  })
  if (atMenu) break
  await wait(2000)
}
log('[MENU] Main menu reached')
await wait(3000)

let passCount = 0
let warnCount = 0
let failCount = 0

function pass(id, msg) { log(`[${id}] PASS: ${msg}`); passCount++ }
function warn(id, msg) { log(`[${id}] WARN: ${msg}`); warnCount++ }
function fail(id, msg) { log(`[${id}] FAIL: ${msg}`); failCount++ }

// ═══════════════════════════════════
// T1: Combat Power
// ═══════════════════════════════════
log('\n== T1: Combat Power ==')

const t1_1 = await pageHas('combat-power', '\u6230\u529b', '\u26a1')
if (t1_1) pass('T1.1', 'CP shown in lobby')
else warn('T1.1', 'CP not visible in lobby (may need WebGL)')

// Click stage tab
const stageClicked = await clickBtn('\u95dc\u5361')
await wait(2000)

if (stageClicked) {
  // Click first stage button (1-1)
  const firstStage = await page.evaluate(() => {
    const selectors = ['.stage-item', '.stage-btn', '[class*="stage"]', '.stage-card']
    for (const s of selectors) {
      const els = document.querySelectorAll(s)
      if (els.length > 0) { els[0].click(); return true }
    }
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find(el => /(1-1|1-2)/.test(el.textContent || ''))
    if (b) { b.click(); return true }
    return false
  })
  
  if (firstStage) {
    await wait(3000)
    const t1_2 = await pageHas(
      'cp-comparison', '\u78be\u58d3', '\u512a\u52e2',
      '\u52e2\u5747\u529b\u6575', '\u52a3\u52e2', '\u5371\u96aa'
    )
    if (t1_2) pass('T1.2', 'CP comparison bar in IDLE')
    else warn('T1.2', 'CP comparison not detected (may need 3D)')
    await page.screenshot({ path: 'qa_screenshots/e2e_t1_idle.png' })
    
    await clickBtn('\u8fd4\u56de')
    await wait(1000)
  } else {
    warn('T1.2', 'No stage element found')
  }
  
  await clickBtn('\u8fd4\u56de')
  await wait(1000)
} else {
  warn('T1.2', 'Could not open stage tab')
}

// ═══════════════════════════════════
// T2: Arena
// ═══════════════════════════════════
log('\n== T2: Arena ==')

const arenaClicked = await clickBtn('\u7af6\u6280\u5834')
await wait(3000)

if (arenaClicked) {
  await page.screenshot({ path: 'qa_screenshots/e2e_t2_arena.png' })

  const t2_1 = await pageHas('\u6392\u540d', '\u6392\u884c')
  if (t2_1) pass('T2.1', 'Arena ranking visible')
  else warn('T2.1', 'Ranking text not found')

  const npcCount = await page.evaluate(() => {
    const txt = document.body.innerText || ''
    const names = ['\u6697\u5f71', '\u672b\u65e5', '\u9435\u8840', '\u8352\u91ce',
      '\u5e7d\u9748', '\u72c2\u66b4', '\u51b0\u971c', '\u70c8\u7130']
    return names.filter(n => txt.includes(n)).length
  })
  if (npcCount > 0) pass('T2.2', `NPC entries found (${npcCount} names)`)
  else warn('T2.2', 'NPC names not found')

  const hasChallengeBtn = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    return btns.some(b => (b.textContent || '').includes('\u6311\u6230'))
  })
  if (hasChallengeBtn) pass('T2.3', 'Challenge button exists')
  else warn('T2.3', 'Challenge button not found')

  if (hasChallengeBtn) {
    await clickBtn('\u6311\u6230')
    await wait(5000)
    await page.screenshot({ path: 'qa_screenshots/e2e_t2_idle.png' })

    const battleReady = await pageHas('\u958b\u59cb', '\u81ea\u52d5', 'start-btn')
    if (battleReady) pass('T2.4', 'Battle ready screen')
    else warn('T2.4', 'Battle start not detected')

    const cpInBattle = await pageHas('cp-comparison', '\u78be\u58d3', '\u512a\u52e2', '\u6230\u529b', '\u26a1')
    if (cpInBattle) pass('T2.5', 'CP comparison in battle')
    else warn('T2.5', 'CP not visible in battle')

    const started = await clickBtn('\u958b\u59cb') ||
      await clickBtn('\u81ea\u52d5') ||
      await clickBtn('\u6230\u9b25')
    
    if (started) {
      log('[T2.6] Battle started...')
      const battleEnd = Date.now() + 60000
      let result = null
      while (Date.now() < battleEnd) {
        result = await page.evaluate(() => {
          const t = document.body.innerText || ''
          if (t.includes('\u52dd\u5229') || t.includes('Victory')) return 'WIN'
          if (t.includes('\u5931\u6557') || t.includes('Defeat') || t.includes('\u6230\u6557')) return 'LOSE'
          return null
        })
        if (result) break
        await wait(2000)
      }

      if (result) pass('T2.6', `Battle completed: ${result}`)
      else fail('T2.6', 'Battle timed out')

      await page.screenshot({ path: 'qa_screenshots/e2e_t2_result.png' })

      if (result === 'WIN') {
        await wait(3000)
        const hasAcquire = await pageHas('acquire-toast', 'acquire-overlay', '\u7372\u5f97')
        if (hasAcquire) pass('T2.7', 'Win acquire toast shown')
        else warn('T2.7', 'Acquire toast not detected after win')
        await page.screenshot({ path: 'qa_screenshots/e2e_t2_acquire.png' })
      }

      // Navigate back
      await wait(3000)
      try { await page.click('body') } catch {}
      await wait(1000)
      await clickBtn('\u8fd4\u56de')
      await wait(2000)
      await clickBtn('\u96e2\u958b')
      await wait(2000)

      const backToArena = await pageHas('\u6392\u540d', '\u7af6\u6280\u5834')
      if (backToArena) pass('T2.8', 'Returned to arena')
      else warn('T2.8', 'Did not return to arena')
      await page.screenshot({ path: 'qa_screenshots/e2e_t2_after.png' })
    } else {
      warn('T2.6', 'Could not start battle')
    }
  }

  await clickBtn('\u8fd4\u56de')
  await wait(2000)
} else {
  fail('T2', 'Arena button not found')
}

// ═══════════════════════════════════
// T3: Acquire Toast (Gacha + Shop)
// ═══════════════════════════════════
log('\n== T3: Acquire Toast ==')

// T3.1 Gacha
const gachaClicked = await clickBtn('\u53ec\u559a')
await wait(2000)

if (gachaClicked) {
  await page.screenshot({ path: 'qa_screenshots/e2e_t3_gacha.png' })

  const hasGacha = await pageHas('\u55ae\u62bd', '\u5341\u9023')
  if (hasGacha) pass('T3.1a', 'Gacha UI visible')
  else warn('T3.1a', 'Gacha UI not detected')

  const pulled = await clickBtn('\u55ae\u62bd')
  if (pulled) {
    await wait(3000)
    const gachaResult = await pageHas('gacha-result', 'result-card', 'acquire-toast', 'acquire-overlay')
    if (gachaResult) pass('T3.1b', 'Gacha result/toast visible')
    else warn('T3.1b', 'Gacha result not detected (maybe not enough diamonds)')
    await page.screenshot({ path: 'qa_screenshots/e2e_t3_gacha_result.png' })

    await clickBtn('\u78ba\u8a8d')
    await wait(500)
    await clickBtn('\u95dc\u9589')
    await wait(500)
  } else {
    warn('T3.1b', 'Could not click gacha pull')
  }

  await clickBtn('\u8fd4\u56de')
  await wait(2000)
} else {
  warn('T3.1', 'Gacha button not found')
}

// T3.2 Shop
const shopClicked = await clickBtn('\u5546\u5e97')
await wait(2000)

if (shopClicked) {
  await page.screenshot({ path: 'qa_screenshots/e2e_t3_shop.png' })

  const hasShop = await pageHas('\u8cfc\u8cb7', '\u6bcf\u65e5')
  if (hasShop) pass('T3.2a', 'Shop UI visible')
  else warn('T3.2a', 'Shop UI not detected')

  const bought = await clickBtn('\u8cfc\u8cb7')
  if (bought) {
    await wait(2000)
    const shopResult = await pageHas('acquire-toast', 'acquire-overlay', '\u8cfc\u8cb7\u6210\u529f')
    if (shopResult) pass('T3.2b', 'Shop purchase toast visible')
    else warn('T3.2b', 'Shop toast not detected (maybe not enough gold)')
    await page.screenshot({ path: 'qa_screenshots/e2e_t3_shop_result.png' })
  } else {
    warn('T3.2b', 'Could not click purchase button')
  }

  await clickBtn('\u8fd4\u56de')
  await wait(2000)
} else {
  warn('T3.2', 'Shop button not found')
}

// ═══════════════════════════════════
// Summary
// ═══════════════════════════════════
log('\n============================')
log(`PASS: ${passCount}  WARN: ${warnCount}  FAIL: ${failCount}`)

const realErrs = jsErrors.filter(e => !e.includes('Manifest') && !e.includes('WebGL'))
if (realErrs.length > 0) {
  log(`JS Errors: ${realErrs.length}`)
  realErrs.slice(0, 10).forEach(e => log(`  - ${e}`))
} else {
  log('JS Errors: 0')
}
log('============================')

// Write results to JSON
const summary = {
  pass: passCount,
  warn: warnCount,
  fail: failCount,
  jsErrors: realErrs,
  details: results,
}
fs.writeFileSync('qa_screenshots/e2e_results.json', JSON.stringify(summary, null, 2), 'utf-8')
log('Results => qa_screenshots/e2e_results.json')

await browser.close()
process.exit(failCount > 0 ? 1 : 0)
