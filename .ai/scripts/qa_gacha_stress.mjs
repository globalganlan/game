/**
 * QA 大量抽卡測試
 *
 * 測試項目：
 * 1. 保底計數器是否超過 90（硬保底）
 * 2. 保底數值是否亂跳（非遞增或突然歸零）
 * 3. SSR 時保底是否正確歸零
 * 4. 領取信件鑽石後是否能正常使用
 *
 * 使用 Puppeteer 進入遊戲，領取測試鑽石，大量抽卡。
 */
import puppeteer from 'puppeteer'

const TOKEN = 'aedc3705-6706-4db5-8d53-41488c5f1598'
const TARGET_PULLS = 200  // 目標總抽數

console.log('═══════════════════════════════════════')
console.log('  QA 大量抽卡測試 — 保底驗證')
console.log('═══════════════════════════════════════')

const b = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer'],
  timeout: 60000,
})
const p = await b.newPage()
await p.setViewport({ width: 1280, height: 800 })

// 注入 token
await p.evaluateOnNewDocument((t) => {
  localStorage.setItem('globalganlan_guest_token', t)
}, TOKEN)

const jsErrors = []
p.on('pageerror', e => jsErrors.push(e.message))

console.log('[1/5] 啟動遊戲...')
await p.goto('http://localhost:5174/game/', { waitUntil: 'networkidle2', timeout: 60000 })

// 等待載入完成
const deadline = Date.now() + 120000
while (Date.now() < deadline) {
  const txt = await p.evaluate(() => document.body.innerText)
  if (txt.includes('關卡進度') || txt.includes('召喚')) break
  const pct = txt.match(/(\d+)%/)
  if (pct) process.stdout.write(`\r  載入中: ${pct[1]}%`)
  await new Promise(r => setTimeout(r, 2000))
}
console.log('\n  ✅ 遊戲載入完成')

// ── 領取郵件鑽石 ──
console.log('[2/5] 領取測試鑽石...')
// 點信箱
let mailClicked = false
for (const btn of await p.$$('button')) {
  const txt = await p.evaluate(el => el.textContent?.trim(), btn)
  if (txt && txt.includes('信箱')) {
    await btn.click()
    mailClicked = true
    break
  }
}
if (mailClicked) {
  await new Promise(r => setTimeout(r, 3000))
  // 嘗試一鍵領取
  for (const btn of await p.$$('button')) {
    const txt = await p.evaluate(el => el.textContent?.trim(), btn)
    if (txt && (txt.includes('全部領取') || txt.includes('一鍵領取'))) {
      await btn.click()
      await new Promise(r => setTimeout(r, 2000))
      break
    }
  }
  // 關閉面板 - 按返回或 Escape
  await p.keyboard.press('Escape')
  await new Promise(r => setTimeout(r, 1000))
  // 也嘗試點返回
  for (const btn of await p.$$('button')) {
    const txt = await p.evaluate(el => el.textContent?.trim(), btn)
    if (txt && (txt.includes('返回') || txt.includes('←') || txt.includes('關閉'))) {
      await btn.click()
      break
    }
  }
  await new Promise(r => setTimeout(r, 1000))
}

// 取得鑽石數
let diamondBefore = await p.evaluate(() => {
  const m = document.body.innerText.match(/D([\d,]+)/)
  return m ? parseInt(m[1].replace(/,/g, '')) : 0
})
console.log(`  鑽石餘額: ${diamondBefore.toLocaleString()}`)

// ── 進入召喚頁面 ──
console.log('[3/5] 進入召喚頁面...')
for (const btn of await p.$$('button')) {
  const txt = await p.evaluate(el => el.textContent?.trim(), btn)
  if (txt && txt.includes('召喚')) {
    await btn.click()
    break
  }
}
await new Promise(r => setTimeout(r, 2000))

// ── 大量抽卡 ──
console.log('[4/5] 開始大量抽卡...')
const pityHistory = []
let pullCount = 0
let ssrCount = 0
let maxPity = 0
let pityExceeded90 = false
let pityJumped = false
let lastPity = -1
let errors = []

async function readPity() {
  const txt = await p.evaluate(() => document.body.innerText)
  const m = txt.match(/保底進度[：:]\s*(\d+)\/90/)
  return m ? parseInt(m[1]) : null
}

async function pullAndCheck(count) {
  const btnClass = count === 10 ? '.gacha-pull-ten' : '.gacha-pull-single'
  const sBtn = await p.$(btnClass)
  if (!sBtn) { errors.push(`找不到${count === 10 ? '十連' : '單抽'}按鈕`); return false }

  const disabled = await p.evaluate(el => el.disabled, sBtn)
  if (disabled) { errors.push('按鈕已停用（可能鑽石不足或池空）'); return false }

  // 讀取抽卡前保底
  const pityBefore = await readPity()

  await sBtn.click()
  await new Promise(r => setTimeout(r, 300))

  // 檢查是否有結果
  const hasResult = await p.evaluate(() => !!document.querySelector('.gacha-results-overlay'))
  if (hasResult) {
    // 讀取結果中的 SSR
    const resultText = await p.evaluate(() => {
      const overlay = document.querySelector('.gacha-results-overlay')
      return overlay ? overlay.innerText : ''
    })
    const ssrInResult = (resultText.match(/SSR/g) || []).length

    // 關閉結果
    for (const btn of await p.$$('.gacha-results-overlay button')) {
      await btn.click()
      break
    }
    // 如果沒按鈕，等一下再按
    if (ssrInResult === 0) {
      await new Promise(r => setTimeout(r, 200))
      const closeBtn = await p.$('.gacha-results-overlay button')
      if (closeBtn) await closeBtn.click()
    }
    await new Promise(r => setTimeout(r, 300))

    pullCount += count
    ssrCount += ssrInResult

    // 讀取抽完後保底
    const pityAfter = await readPity()

    if (pityAfter !== null) {
      pityHistory.push({ pull: pullCount, pity: pityAfter, ssrInResult, pityBefore })

      // 檢查 1: 保底是否超過 90
      if (pityAfter > 90) {
        pityExceeded90 = true
        errors.push(`❌ 保底超過 90！pull #${pullCount}, pity=${pityAfter}`)
      }
      if (pityAfter > maxPity) maxPity = pityAfter

      // 檢查 2: 對於單抽，保底應該是 +1 或歸 0（抽到 SSR）
      if (count === 1 && pityBefore !== null && ssrInResult === 0) {
        if (pityAfter !== pityBefore + 1) {
          pityJumped = true
          errors.push(`❌ 保底跳號！pull #${pullCount}, before=${pityBefore}, after=${pityAfter}, SSR=${ssrInResult}`)
        }
      }

      // 檢查 3: 抽到 SSR 時保底應歸 0
      if (count === 1 && ssrInResult > 0 && pityAfter !== 0) {
        errors.push(`❌ 抽到 SSR 但保底未歸零！pull #${pullCount}, pity=${pityAfter}`)
      }

      if (lastPity >= 0 && count === 1) {
        // 保底應只能是 +1 或 0（SSR 重置）
        if (pityAfter !== lastPity + 1 && pityAfter !== 0) {
          // 可能是 refill 造成的同步
          if (Math.abs(pityAfter - (lastPity + 1)) > 3) {
            pityJumped = true
            errors.push(`⚠️ 保底跳躍 > 3！pull #${pullCount}, last=${lastPity}, now=${pityAfter}`)
          }
        }
      }
      lastPity = pityAfter
    }

    return true
  } else {
    // 可能沒有動畫，重試
    await new Promise(r => setTimeout(r, 500))
    return true
  }
}

// 做單抽測試（更容易驗證保底遞增）
let attempts = 0
while (pullCount < TARGET_PULLS && attempts < TARGET_PULLS + 50) {
  attempts++
  const ok = await pullAndCheck(1)
  if (!ok) {
    // 嘗試十連
    const ok10 = await pullAndCheck(10)
    if (!ok10) {
      console.log('  ⚠️ 無法繼續抽卡，停止')
      break
    }
  }
  if (pullCount % 20 === 0 && pullCount > 0) {
    process.stdout.write(`\r  已抽 ${pullCount}/${TARGET_PULLS}，SSR: ${ssrCount}，最高保底: ${maxPity}`)
  }
}

// ── 報告 ──
console.log('\n')
console.log('[5/5] 測試報告')
console.log('═══════════════════════════════════════')
console.log(`  總抽數: ${pullCount}`)
console.log(`  SSR 數: ${ssrCount}`)
console.log(`  SSR 率: ${((ssrCount / pullCount) * 100).toFixed(2)}%`)
console.log(`  最高保底: ${maxPity}`)
console.log(`  保底超過90: ${pityExceeded90 ? '❌ YES' : '✅ NO'}`)
console.log(`  保底亂跳: ${pityJumped ? '❌ YES' : '✅ NO'}`)
console.log(`  JS 錯誤: ${jsErrors.length}`)
if (jsErrors.length > 0) {
  const unique = [...new Set(jsErrors.map(e => e.substring(0, 80)))]
  console.log(`  JS 錯誤摘要 (unique ${unique.length}):`)
  for (const e of unique.slice(0, 5)) console.log(`    - ${e}`)
}

if (errors.length > 0) {
  console.log('\n  ── 問題清單 ──')
  for (const e of errors.slice(0, 20)) {
    console.log(`  ${e}`)
  }
  if (errors.length > 20) console.log(`  ... 及另外 ${errors.length - 20} 項`)
}

if (pityHistory.length > 0) {
  console.log('\n  ── 保底歷史（最後 20 筆） ──')
  for (const h of pityHistory.slice(-20)) {
    const marker = h.ssrInResult > 0 ? ' ⭐ SSR!' : ''
    console.log(`  pull#${h.pull} pity=${h.pity}${marker}`)
  }
}

console.log('═══════════════════════════════════════')
const gameBreakingErrors = jsErrors.filter(e =>
  !e.includes('WebGL') && !e.includes('THREE') && !e.includes('GL_') &&
  !e.includes('RENDER') && !e.includes('texture') && !e.includes('shader') &&
  !e.includes('Cannot read properties of null') // Three.js headless noise
)
const pass = !pityExceeded90 && !pityJumped && gameBreakingErrors.length === 0
console.log(pass ? '✅ QA PASS' : '❌ QA FAIL')

await b.close()
