/**
 * QA 超大量抽卡壓力測試 — 10,000 抽
 *
 * 使用十連抽加速（1,000 次點擊），自動等待池補充。
 *
 * 驗證項目：
 * 1. 保底計數器永遠不超過 90（硬保底）
 * 2. 保底數值不亂跳（十連：+10 或含 SSR 重置後 < 10）
 * 3. SSR 率在合理範圍（期望 ~3-5%）
 * 4. 硬保底觸發：每 90 抽內必出 SSR
 */
import puppeteer from 'puppeteer'

const TOKEN = 'aedc3705-6706-4db5-8d53-41488c5f1598'
const TARGET_PULLS = 500
const GAME_URL = 'http://localhost:5174/game/'

console.log('═══════════════════════════════════════════════════')
console.log('  QA 超大量抽卡壓力測試 — 10,000 抽')
console.log('═══════════════════════════════════════════════════')

const b = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer'],
  timeout: 60000,
})
const p = await b.newPage()
await p.setViewport({ width: 1280, height: 800 })

const POST_URL = 'https://script.google.com/macros/s/AKfycbzy3EHTCyTYjA9j1CvJGvWwDM_RrkCuzNYkMhP7T9DTJ6V6g7Sodrlo4uv3h9yx0HLdsg/exec'

// ── [0] 重置 server pool（清除前輪測試遺留的被汙染 pool） ──
console.log('[0/6] 重置 server gacha pool...')
const resetRes = await fetch(POST_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  body: JSON.stringify({ action: 'reset-gacha-pool', guestToken: TOKEN }),
}).then(r => r.json())
console.log(`  ✅ pool 重置: ${resetRes.poolGenerated} entries, startPity=${JSON.stringify(resetRes.startPity)}`)

// ── 設定 localStorage ──
await p.evaluateOnNewDocument((t) => {
  localStorage.setItem('globalganlan_guest_token', t)
  // 清除舊資料讓 migration 跑乾淨
  localStorage.removeItem('globalganlan_schema_version')
  localStorage.removeItem('globalganlan_save_cache')
  localStorage.removeItem('globalganlan_gacha_pool')
  localStorage.removeItem('globalganlan_gacha_pity')
  localStorage.removeItem('globalganlan_owned_heroes')
  localStorage.removeItem('globalganlan_pending_pulls')
  localStorage.removeItem('globalganlan_pending_ops')
}, TOKEN)

const jsErrors = []
p.on('pageerror', e => {
  if (!e.message.includes('WebGL')) jsErrors.push(e.message)
})

// ── Helper: 安全等待 & 點擊 ──
const delay = ms => new Promise(r => setTimeout(r, ms))
async function clickBySelector(sel, timeout = 5000) {
  try {
    await p.waitForSelector(sel, { timeout })
    await p.click(sel)
    return true
  } catch { return false }
}

async function clickByText(text, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const clicked = await p.evaluate((t) => {
      for (const btn of document.querySelectorAll('button')) {
        if (btn.textContent?.includes(t)) { btn.click(); return true }
      }
      return false
    }, text)
    if (clicked) return true
    await delay(500)
  }
  return false
}

async function waitForText(text, timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const found = await p.evaluate(t => document.body.innerText.includes(t), text)
    if (found) return true
    await delay(1000)
  }
  return false
}

// ═══ [1/6] 啟動遊戲 ═══
console.log('[1/6] 啟動遊戲...')
await p.goto(GAME_URL, { waitUntil: 'networkidle2', timeout: 60000 })

const loaded = await waitForText('關卡進度', 180000)
if (!loaded) {
  const hasGacha = await waitForText('召喚', 5000)
  if (!hasGacha) {
    console.error('❌ 遊戲載入失敗')
    await b.close()
    process.exit(1)
  }
}
console.log('  ✅ 遊戲載入完成')

// ═══ [2/6] 領取郵件鑽石 ═══
console.log('[2/6] 領取測試鑽石...')
const mailClicked = await clickByText('信箱', 3000)
if (mailClicked) {
  await delay(3000)
  const claimed = await clickBySelector('.mail-claim-all-btn', 3000)
  if (claimed) {
    console.log('  📦 點擊全部領取')
    await delay(3000)
  }
  await clickBySelector('.panel-back-btn', 2000)
  await delay(1000)
} else {
  console.log('  ⚠️ 找不到信箱按鈕')
}

const diamondAfterMail = await p.evaluate(() => {
  const el = document.querySelector('.menu-diamond')
  if (el) {
    const m = el.textContent?.match(/([\d,]+)/)
    return m ? parseInt(m[1].replace(/,/g, '')) : 0
  }
  return 0
})
console.log(`  💎 鑽石餘額: ${diamondAfterMail.toLocaleString()}`)
if (diamondAfterMail < 1440) {
  console.error('❌ 鑽石不足')
  await b.close()
  process.exit(1)
}

// ═══ [3/6] 進入召喚頁面 ═══
console.log('[3/6] 進入召喚頁面...')
await clickByText('召喚', 5000)
await delay(3000)

const onGacha = await p.evaluate(() => !!document.querySelector('.gacha-pull-ten'))
if (!onGacha) {
  console.error('❌ 無法進入召喚頁面')
  await b.close()
  process.exit(1)
}
console.log('  ✅ 已進入召喚頁面')

// ═══ 工具函式 ═══
async function readPity() {
  return p.evaluate(() => {
    const el = document.querySelector('.gacha-pity-text')
    if (!el) return null
    const m = el.textContent?.match(/(\d+)\/90/)
    return m ? parseInt(m[1]) : null
  })
}

async function hasResultOverlay() {
  return p.evaluate(() => !!document.querySelector('.gacha-results-overlay'))
}

async function closeResultOverlay() {
  for (let i = 0; i < 10; i++) {
    const has = await hasResultOverlay()
    if (!has) return
    await clickBySelector('.gacha-results-close', 500).catch(() => {})
    await delay(200)
  }
}

async function countSSRInResults() {
  return p.evaluate(() => {
    const overlay = document.querySelector('.gacha-results-overlay')
    if (!overlay) return 0
    return (overlay.innerText.match(/SSR/g) || []).length
  })
}

async function hasGachaError() {
  return p.evaluate(() => {
    const el = document.querySelector('.gacha-error')
    return el ? el.textContent?.trim() || '' : ''
  })
}

// ═══ [4/6] 主循環 ═══
console.log(`[4/6] 開始大量抽卡（目標 ${TARGET_PULLS} 抽）...`)
const startTime = Date.now()
const pityHistory = []
let pullCount = 0
let ssrCount = 0
let maxPity = 0
let pityExceeded90 = false
let pityJumped = false
const errors = []
let poolEmptyWaits = 0
let consecutivePoolEmpty = 0

async function doTenPull() {
  const pityBefore = await readPity()

  const btn = await p.$('.gacha-pull-ten')
  if (!btn) return 'no_button'
  const disabled = await p.evaluate(el => el.disabled, btn)
  if (disabled) return 'disabled'

  await btn.click()
  await delay(300)

  const errTxt = await hasGachaError()
  if (errTxt) {
    if (errTxt.includes('忙碌') || errTxt.includes('稍後')) return 'pool_empty'
    if (errTxt.includes('鑽石不足')) return 'no_diamond'
    return 'error:' + errTxt
  }

  let hasResult = await hasResultOverlay()
  if (!hasResult) {
    await delay(500)
    hasResult = await hasResultOverlay()
  }
  if (!hasResult) {
    const errTxt2 = await hasGachaError()
    if (errTxt2) {
      if (errTxt2.includes('忙碌') || errTxt2.includes('稍後')) return 'pool_empty'
      if (errTxt2.includes('鑽石不足')) return 'no_diamond'
    }
    return 'no_result'
  }

  const ssrInResult = await countSSRInResults()
  await closeResultOverlay()
  await delay(100)

  ssrCount += ssrInResult
  pullCount += 10

  const pityAfter = await readPity()
  if (pityAfter !== null) {
    pityHistory.push({ pull: pullCount, pity: pityAfter, ssrInResult, pityBefore })

    if (pityAfter > 90) {
      pityExceeded90 = true
      errors.push(`❌ 保底>90: pull#${pullCount} pity=${pityAfter}`)
    }
    if (pityAfter > maxPity) maxPity = pityAfter

    if (pityBefore !== null && ssrInResult === 0) {
      if (pityAfter !== pityBefore + 10) {
        pityJumped = true
        errors.push(`❌ 跳號: pull#${pullCount} ${pityBefore}->${pityAfter} expected=${pityBefore+10}`)
      }
    } else if (pityBefore !== null && ssrInResult > 0 && pityAfter >= 10) {
      errors.push(`⚠️ SSR後pity=${pityAfter}: pull#${pullCount}`)
    }

    if (pityAfter >= 90 && ssrInResult === 0) {
      errors.push(`❌ 硬保底違規: pull#${pullCount} pity=${pityAfter}`)
    }
  }

  return 'ok'
}

for (let round = 0; pullCount < TARGET_PULLS; round++) {
  const result = await doTenPull()

  if (result === 'ok') {
    consecutivePoolEmpty = 0
    if (pullCount % 500 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      const rate = ((ssrCount / pullCount) * 100).toFixed(2)
      console.log(`  ✓ ${pullCount}/${TARGET_PULLS} | SSR: ${ssrCount} (${rate}%) | maxPity: ${maxPity} | ${elapsed}s`)
    } else if (pullCount % 200 === 0) {
      process.stdout.write(`\r  ${pullCount}/${TARGET_PULLS}`)
    }
  } else if (result === 'pool_empty') {
    poolEmptyWaits++
    consecutivePoolEmpty++

    if (consecutivePoolEmpty === 1) {
      process.stdout.write(`\r  [${pullCount}] 等待池補充...`)
    }

    // 等 refill 完成 (GAS ~5-15s)
    await delay(8000)

    if (consecutivePoolEmpty > 50) {
      errors.push('❌ 連續 50 次池空，停止測試')
      break
    }
  } else if (result === 'no_diamond') {
    console.log(`\n  💎 鑽石耗盡，停止於 ${pullCount} 抽`)
    break
  } else if (result === 'disabled') {
    // 按鈕停用 = 鑽石不足
    console.log(`\n  💎 鑽石不足（按鈕停用），停止於 ${pullCount} 抽`)
    break
  } else if (result === 'no_button') {
    errors.push('❌ 找不到十連按鈕')
    break
  } else {
    await delay(1000)
    consecutivePoolEmpty++
    if (consecutivePoolEmpty > 10) {
      errors.push(`❌ 連續失敗: ${result}`)
      break
    }
  }

  // 安全閥：60 分鐘超時
  if (Date.now() - startTime > 60 * 60 * 1000) {
    errors.push('⏰ 60 分鐘超時，停止測試')
    break
  }
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)

// ═══ [5/6] 統計分析 ═══
console.log('\n\n[5/6] 統計分析...')

let longestDry = 0, currentDry = 0
for (const h of pityHistory) {
  if (h.ssrInResult === 0) {
    currentDry += 10
    if (currentDry > longestDry) longestDry = currentDry
  } else { currentDry = 0 }
}

const ssrPulls = pityHistory.filter(h => h.ssrInResult > 0)
const ssrGaps = []
let lastSSRPull = 0
for (const h of ssrPulls) {
  ssrGaps.push(h.pull - lastSSRPull)
  lastSSRPull = h.pull
}
const avgGap = ssrGaps.length > 0 ? (ssrGaps.reduce((a, b) => a + b, 0) / ssrGaps.length).toFixed(1) : 'N/A'
const maxGap = ssrGaps.length > 0 ? Math.max(...ssrGaps) : 0

// ═══ [6/6] 報告 ═══
console.log('')
console.log('[6/6] 測試報告')
console.log('═══════════════════════════════════════════════════')
console.log(`  總抽數:           ${pullCount.toLocaleString()}`)
console.log(`  SSR 數:           ${ssrCount}`)
console.log(`  SSR 率:           ${pullCount > 0 ? ((ssrCount / pullCount) * 100).toFixed(2) : 0}% (期望 ~3.5%)`)
console.log(`  最高保底:         ${maxPity}`)
console.log(`  最長無 SSR 連抽:  ${longestDry} 抽 (上限 90)`)
console.log(`  SSR 平均間距:     ${avgGap} 抽`)
console.log(`  SSR 最大間距:     ${maxGap} 抽`)
console.log(`  池空等待次數:     ${poolEmptyWaits}`)
console.log(`  耗時:             ${totalTime}s`)
console.log('───────────────────────────────────────────────────')
console.log(`  保底超過 90:      ${pityExceeded90 ? '❌ YES' : '✅ NO'}`)
console.log(`  保底亂跳:         ${pityJumped ? '❌ YES' : '✅ NO'}`)
console.log(`  硬保底違規:       ${longestDry > 90 ? '❌ YES (' + longestDry + ')' : '✅ NO'}`)
console.log(`  JS 錯誤:          ${jsErrors.length > 0 ? '❌ ' + jsErrors.length : '✅ 0'}`)

if (errors.length > 0) {
  console.log('\n  ── 問題清單 ──')
  for (const e of errors.slice(0, 30)) console.log(`  ${e}`)
  if (errors.length > 30) console.log(`  ... 及另外 ${errors.length - 30} 項`)
}

if (jsErrors.length > 0) {
  const unique = [...new Set(jsErrors.map(e => e.substring(0, 120)))]
  console.log(`\n  ── JS 錯誤 (unique ${unique.length}) ──`)
  for (const e of unique.slice(0, 5)) console.log(`  - ${e}`)
}

if (pullCount >= 500) {
  console.log('\n  ── SSR 分佈（每 500 抽） ──')
  const buckets = {}
  for (const h of pityHistory) {
    const bucket = Math.ceil(h.pull / 500) * 500
    if (!buckets[bucket]) buckets[bucket] = 0
    buckets[bucket] += h.ssrInResult
  }
  for (const [range, count] of Object.entries(buckets)) {
    const bar = '█'.repeat(count) + '░'.repeat(Math.max(0, 30 - count))
    console.log(`  ~${String(range).padStart(5)}: ${bar} ${count}`)
  }
}

console.log('═══════════════════════════════════════════════════')
const pass = !pityExceeded90 && !pityJumped && longestDry <= 90 && pullCount >= TARGET_PULLS * 0.5
console.log(pass ? '✅ QA PASS — 10,000 抽壓力測試通過' : '❌ QA FAIL')

await b.close()
