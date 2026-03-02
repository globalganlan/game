/**
 * qa_browser_test.mjs — 實際瀏覽器 E2E 測試
 * 
 * 測試流程：登入畫面 → 訪客登入 → 進大廳 → 確認無白屏/報錯
 * 
 * Usage: node scripts/qa_browser_test.mjs [port]
 */
import puppeteer from 'puppeteer'

const PORT = process.argv[2] || '5174'
const URL = `http://localhost:${PORT}/game/`
const TIMEOUT = 30000

async function run() {
  console.log(`\n🎮 啟動瀏覽器 E2E 測試: ${URL}\n`)
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--window-size=1280,800', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  })

  const page = await browser.newPage()
  const errors = []
  const consoleLogs = []

  // 收集 console error
  page.on('console', msg => {
    const text = msg.text()
    consoleLogs.push(`[${msg.type()}] ${text}`)
    if (msg.type() === 'error' && 
        !text.includes('favicon') && 
        !text.includes('DevTools') &&
        !text.includes('Manifest') &&
        !text.includes('401') &&
        !text.includes('net::ERR_FAILED')) {
      errors.push(text)
    }
  })

  // 收集 page crash
  page.on('pageerror', err => {
    errors.push(`PAGE ERROR: ${err.message}`)
  })

  try {
    // ── Step 1: 開啟遊戲 ──
    console.log('📌 Step 1: 開啟遊戲頁面...')
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: TIMEOUT })
    console.log('   ✅ 頁面載入完成')

    // ── Step 2: 等待登入畫面 ──
    console.log('📌 Step 2: 等待登入畫面...')
    const loginScreen = await page.waitForSelector('.login-screen', { timeout: 10000 }).catch(() => null)
    
    if (loginScreen) {
      console.log('   ✅ 登入畫面出現')
      
      // 截圖
      await page.screenshot({ path: 'qa_screenshots/01_login_screen.png' })
      console.log('   📸 截圖: qa_screenshots/01_login_screen.png')

      // ── Step 3: 等待自動登入 or 點擊訪客模式 ──
      console.log('📌 Step 3: 等待登入處理...')
      
      // 等最多 8 秒看自動登入結果
      await page.waitForFunction(() => {
        const loading = document.querySelector('.login-status-text')
        return !loading || !loading.textContent.includes('連線中')
      }, { timeout: 8000 }).catch(() => null)

      // 檢查是否已登入成功 or 需要點按鈕
      const needManualLogin = await page.evaluate(() => {
        const btn = document.querySelector('.login-btn-primary')
        return btn && btn.textContent.includes('訪客模式')
      })

      if (needManualLogin) {
        console.log('   ℹ️ 需要手動註冊訪客帳號，點擊「訪客模式進入」')
        await page.click('.login-btn-primary')
        await new Promise(r => setTimeout(r, 3000))
      }

      // 等登入成功訊息
      const welcomeMsg = await page.waitForSelector('.login-success', { timeout: 10000 }).catch(() => null)
      if (welcomeMsg) {
        const text = await page.evaluate(el => el.textContent, welcomeMsg)
        console.log(`   ✅ 登入成功: ${text}`)
      }
    } else {
      console.log('   ℹ️ 無登入畫面（可能已登入）')
    }

    // ── Step 4: 等待進入遊戲（3D場景 or 主選單） ──
    console.log('📌 Step 4: 等待進入遊戲...')
    
    // 等 canvas 或主選單出現
    const gameLoaded = await page.waitForFunction(() => {
      return document.querySelector('canvas') || 
             document.querySelector('.main-menu') ||
             document.querySelector('.hud-container')
    }, { timeout: 20000 }).catch(() => null)

    if (gameLoaded) {
      console.log('   ✅ 遊戲畫面已載入')
      await new Promise(r => setTimeout(r, 2000)) // 等場景渲染
      await page.screenshot({ path: 'qa_screenshots/02_game_loaded.png' })
      console.log('   📸 截圖: qa_screenshots/02_game_loaded.png')
    } else {
      errors.push('遊戲畫面 20 秒內未載入')
      console.log('   ❌ 遊戲畫面 20 秒內未載入')
    }

    // ── Step 5: 檢查是否有主選單（大廳） ──
    console.log('📌 Step 5: 檢查大廳/主選單...')
    const mainMenu = await page.waitForSelector('.main-menu, .hud-container, .lobby', { timeout: 10000 }).catch(() => null)
    
    if (mainMenu) {
      console.log('   ✅ 大廳/HUD 已出現')
      await page.screenshot({ path: 'qa_screenshots/03_lobby.png' })
      console.log('   📸 截圖: qa_screenshots/03_lobby.png')
    } else {
      // 可能是直接進戰鬥或其他畫面
      const hasCanvas = await page.$('canvas')
      if (hasCanvas) {
        console.log('   ℹ️ 有 Canvas 但無主選單 selector（可能在 3D 場景中）')
        await page.screenshot({ path: 'qa_screenshots/03_current_state.png' })
      } else {
        errors.push('大廳畫面未出現，可能白屏')
        console.log('   ❌ 無 Canvas 也無主選單，可能白屏')
      }
    }

    // ── Step 6: 檢查頁面是否有 React error boundary ──
    console.log('📌 Step 6: 檢查錯誤狀態...')
    const hasError = await page.evaluate(() => {
      const body = document.body.innerText || ''
      return body.includes('Something went wrong') || 
             body.includes('Error') && body.length < 200 ||
             body.includes('白屏')
    })
    
    if (hasError) {
      errors.push('頁面顯示錯誤訊息')
      console.log('   ❌ 偵測到錯誤訊息')
    } else {
      console.log('   ✅ 無錯誤 boundary')
    }

    // ── 結果摘要 ──
    console.log('\n═══════════════════════════════════')
    if (errors.length === 0) {
      console.log('✅ E2E 測試通過！遊戲可正常載入並進入。')
    } else {
      console.log('❌ E2E 測試發現問題:')
      errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`))
    }
    console.log('═══════════════════════════════════\n')

    // 輸出 console 錯誤
    const consoleErrors = consoleLogs.filter(l => l.startsWith('[error]'))
    if (consoleErrors.length > 0) {
      console.log('⚠️ Console 錯誤:')
      consoleErrors.slice(0, 10).forEach(e => console.log(`   ${e}`))
    }

    // 等使用者看完
    console.log('🔍 瀏覽器已開啟，請目視確認遊戲畫面。15 秒後自動關閉...')
    await new Promise(r => setTimeout(r, 15000))

  } catch (err) {
    console.error('💥 測試執行錯誤:', err.message)
    await page.screenshot({ path: 'qa_screenshots/error_state.png' }).catch(() => {})
  } finally {
    await browser.close()
    console.log('🔒 瀏覽器已關閉')
  }

  process.exit(errors.length > 0 ? 1 : 0)
}

run()
