/**
 * qa_deep_test.mjs — 深度瀏覽器測試（檢查 UI 狀態）
 */
import puppeteer from 'puppeteer'

const PORT = process.argv[2] || '5174'
const URL = `http://localhost:${PORT}/game/`

async function run() {
  console.log(`\n🎮 深度瀏覽器測試: ${URL}\n`)
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 }
  })

  const page = await browser.newPage()
  const errors = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  try {
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })
    console.log('✅ 頁面載入完成')

    // 等登入畫面
    await page.waitForSelector('.login-screen', { timeout: 5000 }).catch(() => null)
    await new Promise(r => setTimeout(r, 3000))

    // 點訪客按鈕（如有）
    const needRegister = await page.evaluate(() => {
      const btn = document.querySelector('.login-btn-primary')
      return btn && btn.textContent.includes('訪客模式')
    })
    if (needRegister) {
      console.log('ℹ️ 點擊「訪客模式進入」')
      await page.click('.login-btn-primary')
      await new Promise(r => setTimeout(r, 4000))
    }

    // 等 3D canvas
    const canvas = await page.waitForSelector('canvas', { timeout: 20000 }).catch(() => null)
    if (canvas) {
      console.log('✅ Canvas (3D 場景) 已載入')
    } else {
      console.log('❌ Canvas 未出現')
    }
    
    // 等場景渲染穩定
    await new Promise(r => setTimeout(r, 5000))
    await page.screenshot({ path: 'qa_screenshots/04_full_game.png' })
    console.log('📸 截圖: qa_screenshots/04_full_game.png')

    // 分析 UI 狀態
    const uiState = await page.evaluate(() => {
      const result = {}
      result.hasCanvas = !!document.querySelector('canvas')
      result.hasMainMenu = !!document.querySelector('.main-menu')
      result.hasHud = !!document.querySelector('.hud-container, .hud-top, .hud-bottom')
      result.hasTransition = !!document.querySelector('.transition-overlay')
      result.bodyTextShort = document.body.innerText.substring(0, 300).replace(/\n+/g, ' | ')
      result.buttons = Array.from(document.querySelectorAll('button'))
        .map(b => b.textContent?.trim())
        .filter(Boolean)
        .slice(0, 15)
      result.gameClasses = Array.from(new Set(
        Array.from(document.querySelectorAll('[class]'))
          .flatMap(el => [...el.classList])
      )).filter(c => /main|menu|hud|stage|hero|lobby|game|battle|transition|loading/i.test(c))
      return result
    })

    console.log('\n=== UI 狀態 ===')
    console.log(JSON.stringify(uiState, null, 2))

    // 致命錯誤
    const fatal = errors.filter(e => 
      !e.includes('Manifest') && !e.includes('401') && 
      !e.includes('favicon') && !e.includes('ERR_FAILED') &&
      !e.includes('net::')
    )
    console.log('\n致命 console errors:', fatal.length ? fatal.join('\n') : '無')

    // 再等看更多狀態
    console.log('\n⏳ 等 10 秒讓場景完全穩定...')
    await new Promise(r => setTimeout(r, 10000))
    
    const uiState2 = await page.evaluate(() => {
      return {
        hasMainMenu: !!document.querySelector('.main-menu'),
        hasHud: !!document.querySelector('.hud-container, .hud-top, .hud-bottom'),
        buttons: Array.from(document.querySelectorAll('button'))
          .map(b => b.textContent?.trim())
          .filter(Boolean)
          .slice(0, 15)
      }
    })
    console.log('\n=== 10秒後 UI 狀態 ===')
    console.log(JSON.stringify(uiState2, null, 2))
    
    await page.screenshot({ path: 'qa_screenshots/05_after_wait.png' })
    console.log('📸 截圖: qa_screenshots/05_after_wait.png')

    console.log('\n🔍 瀏覽器等 10 秒後關閉...')
    await new Promise(r => setTimeout(r, 10000))

  } catch (err) {
    console.error('💥 測試錯誤:', err.message)
    await page.screenshot({ path: 'qa_screenshots/error.png' }).catch(() => {})
  } finally {
    await browser.close()
    console.log('🔒 完成')
  }
}

run()
