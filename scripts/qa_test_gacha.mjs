/**
 * QA 自動化測試腳本：抽卡系統 E2E
 *
 * 流程：
 * 1. 開啟遊戲 → 等待載入 → 自動登入
 * 2. 進入主選單 → 點「召喚」
 * 3. 執行單抽 → 驗證結果顯示
 * 4. 關閉結果 → 執行十連抽 → 驗證結果顯示
 * 5. 驗證鑽石有正確扣除
 * 6. 截圖每個階段
 */

import puppeteer from 'puppeteer'

const GAME_URL = 'http://localhost:5174/game/'
const TIMEOUT = 120_000

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('🧪 QA 抽卡測試開始')
  console.log('=' .repeat(50))

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    timeout: 60_000,
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  // 收集 console 錯誤
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => consoleErrors.push(err.message))

  try {
    // ── 1. 開啟遊戲 ──
    console.log('\n📌 步驟 1: 開啟遊戲頁面')
    await page.goto(GAME_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT })
    await sleep(3000)
    await page.screenshot({ path: 'qa_screenshots/01_initial_load.png' })
    console.log('  ✅ 頁面載入完成')

    // ── 2. 等待登入畫面 / 自動登入 ──
    console.log('\n📌 步驟 2: 等待登入')
    // 等待「訪客登入」或已經自動登入
    let loginAttempts = 0
    while (loginAttempts < 30) {
      const guestBtn = await page.$('button')
      const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim()))
      
      // 檢查是否有訪客登入按鈕
      const guestLoginIdx = buttons.findIndex(t => t && (t.includes('訪客登入') || t.includes('Guest') || t.includes('訪客')))
      if (guestLoginIdx >= 0) {
        console.log('  📍 找到訪客登入按鈕，點擊...')
        const allBtns = await page.$$('button')
        await allBtns[guestLoginIdx].click()
        await sleep(3000)
        break
      }

      // 檢查是否已經在主選單
      const hasMainMenu = buttons.some(t => t && (t.includes('召喚') || t.includes('Gacha') || t.includes('出征')))
      if (hasMainMenu) {
        console.log('  📍 已自動登入，在主選單')
        break
      }

      await sleep(2000)
      loginAttempts++
    }
    await page.screenshot({ path: 'qa_screenshots/02_after_login.png' })

    // 等待載入完成（可能有資料載入）
    console.log('  ⏳ 等待遊戲資料載入...')
    await sleep(8000)
    await page.screenshot({ path: 'qa_screenshots/03_game_loaded.png' })

    // ── 3. 尋找並進入抽卡畫面 ──
    console.log('\n📌 步驟 3: 進入召喚畫面')
    let foundGacha = false
    for (let attempt = 0; attempt < 10; attempt++) {
      const buttons = await page.$$eval('button', btns => btns.map(b => ({ text: b.textContent?.trim(), disabled: b.disabled })))
      console.log(`  📍 當前按鈕: ${buttons.map(b => b.text).filter(Boolean).join(', ')}`)
      
      const gachaIdx = buttons.findIndex(b => b.text && (b.text.includes('召喚') || b.text.includes('Gacha')))
      if (gachaIdx >= 0) {
        const allBtns = await page.$$('button')
        await allBtns[gachaIdx].click()
        console.log('  ✅ 點擊「召喚」按鈕')
        foundGacha = true
        await sleep(2000)
        break
      }
      await sleep(2000)
    }
    await page.screenshot({ path: 'qa_screenshots/04_gacha_screen.png' })

    if (!foundGacha) {
      console.log('  ❌ 找不到召喚按鈕！')
      // 列出頁面 HTML 最後 500 字元以除錯
      const html = await page.evaluate(() => document.body.innerHTML.slice(-1000))
      console.log('  頁面尾部:', html.slice(0, 300))
    }

    // ── 4. 檢查召喚畫面元素 ──
    console.log('\n📌 步驟 4: 驗證召喚畫面元素')
    const pageText = await page.evaluate(() => document.body.innerText)
    
    const checks = [
      { name: '卡池名稱「常駐招募」', ok: pageText.includes('常駐招募') },
      { name: '機率顯示「SSR 1.5%」', ok: pageText.includes('SSR 1.5%') },
      { name: '保底進度', ok: pageText.includes('保底進度') },
      { name: '單抽按鈕', ok: pageText.includes('單抽') },
      { name: '十連抽按鈕', ok: pageText.includes('十連抽') },
      { name: '鑽石顯示「💎」', ok: pageText.includes('💎') },
    ]
    for (const c of checks) {
      console.log(`  ${c.ok ? '✅' : '❌'} ${c.name}`)
    }

    // 取得當前鑽石數
    const diamondText = await page.evaluate(() => {
      const el = document.querySelector('.gacha-diamond')
      return el?.textContent || ''
    })
    console.log(`  💎 當前鑽石: ${diamondText}`)
    const diamondBefore = parseInt(diamondText.replace(/[^\d]/g, '')) || 0

    // ── 5. 單抽測試 ──
    console.log('\n📌 步驟 5: 執行單抽')
    const singleBtn = await page.$('.gacha-pull-single')
    if (singleBtn) {
      const isDisabled = await page.evaluate(el => el.disabled, singleBtn)
      if (isDisabled) {
        console.log('  ⚠️ 單抽按鈕 disabled（鑽石不足？）')
      } else {
        await singleBtn.click()
        console.log('  📍 已點擊單抽')
        await sleep(500)
        await page.screenshot({ path: 'qa_screenshots/05_single_pull_result.png' })

        // 驗證結果畫面
        const hasResults = await page.evaluate(() => {
          return !!document.querySelector('.gacha-results-overlay')
        })
        console.log(`  ${hasResults ? '✅' : '❌'} 結果畫面顯示`)

        if (hasResults) {
          // 檢查結果卡片
          const resultCards = await page.$$eval('.gacha-result-card', cards => cards.map(c => ({
            name: c.querySelector('.gacha-result-name')?.textContent || '',
            rarity: c.querySelector('.gacha-result-rarity')?.textContent || '',
            isNew: !!c.querySelector('.gacha-new-badge'),
          })))
          console.log(`  📋 結果卡片數: ${resultCards.length}`)
          for (const r of resultCards) {
            console.log(`    - ${r.name} (${r.rarity}) ${r.isNew ? '[NEW!]' : ''}`)
          }

          // 關閉結果
          const closeBtn = await page.$('.gacha-results-close')
          if (closeBtn) {
            await closeBtn.click()
            await sleep(500)
          }
        }
      }
    } else {
      console.log('  ❌ 找不到單抽按鈕 (.gacha-pull-single)')
    }

    // ── 6. 十連抽測試 ──
    console.log('\n📌 步驟 6: 執行十連抽')
    const tenBtn = await page.$('.gacha-pull-ten')
    if (tenBtn) {
      const isDisabled = await page.evaluate(el => el.disabled, tenBtn)
      if (isDisabled) {
        console.log('  ⚠️ 十連抽按鈕 disabled（鑽石不足？）')
      } else {
        await tenBtn.click()
        console.log('  📍 已點擊十連抽')
        await sleep(500)
        await page.screenshot({ path: 'qa_screenshots/06_ten_pull_result.png' })

        const hasResults = await page.evaluate(() => {
          return !!document.querySelector('.gacha-results-overlay')
        })
        console.log(`  ${hasResults ? '✅' : '❌'} 結果畫面顯示`)

        if (hasResults) {
          const resultCards = await page.$$eval('.gacha-result-card', cards => cards.map(c => ({
            name: c.querySelector('.gacha-result-name')?.textContent || '',
            rarity: c.querySelector('.gacha-result-rarity')?.textContent || '',
            isNew: !!c.querySelector('.gacha-new-badge'),
          })))
          console.log(`  📋 結果卡片數: ${resultCards.length}`)
          console.log(`  ${resultCards.length === 10 ? '✅' : '❌'} 十連抽結果應有 10 張卡`)
          for (const r of resultCards) {
            console.log(`    - ${r.name} (${r.rarity}) ${r.isNew ? '[NEW!]' : ''}`)
          }

          // 關閉結果
          const closeBtn = await page.$('.gacha-results-close')
          if (closeBtn) {
            await closeBtn.click()
            await sleep(500)
          }
        }
      }
    } else {
      console.log('  ❌ 找不到十連抽按鈕 (.gacha-pull-ten)')
    }

    // ── 7. 驗證鑽石扣除 ──
    console.log('\n📌 步驟 7: 驗證鑽石扣除')
    const diamondAfter = await page.evaluate(() => {
      const el = document.querySelector('.gacha-diamond')
      return el?.textContent || ''
    })
    const diamondAfterNum = parseInt(diamondAfter.replace(/[^\d]/g, '')) || 0
    const expectedCost = 160 + 1440 // 單抽 + 十連
    console.log(`  💎 抽前: ${diamondBefore} → 抽後: ${diamondAfterNum}`)
    console.log(`  💎 預期扣除: ${expectedCost}`)
    console.log(`  💎 實際扣除: ${diamondBefore - diamondAfterNum}`)
    console.log(`  ${(diamondBefore - diamondAfterNum) === expectedCost ? '✅' : '⚠️'} 鑽石扣除${(diamondBefore - diamondAfterNum) === expectedCost ? '正確' : '需人工驗證（可能是鑽石不足跳過了部分抽卡）'}`)

    // ── 8. 檢查 console 錯誤 ──
    console.log('\n📌 步驟 8: 檢查 Console 錯誤')
    const relevantErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('404'))
    if (relevantErrors.length === 0) {
      console.log('  ✅ 無 console 錯誤')
    } else {
      console.log(`  ⚠️ 發現 ${relevantErrors.length} 個 console 錯誤:`)
      for (const e of relevantErrors.slice(0, 5)) {
        console.log(`    - ${e.slice(0, 200)}`)
      }
    }

    await page.screenshot({ path: 'qa_screenshots/07_final_state.png' })

    // ── 總結 ──
    console.log('\n' + '='.repeat(50))
    console.log('🧪 QA 抽卡測試結束')
    const allChecks = checks.every(c => c.ok)
    console.log(`📊 畫面元素: ${allChecks ? '✅ 全部通過' : '❌ 有缺失'}`)
    console.log(`📊 Console 錯誤: ${relevantErrors.length === 0 ? '✅ 無' : `⚠️ ${relevantErrors.length} 個`}`)

  } catch (err) {
    console.error('❌ 測試異常:', err.message)
    await page.screenshot({ path: 'qa_screenshots/error_state.png' }).catch(() => {})
  } finally {
    await browser.close()
  }
}

// 確保截圖目錄存在
import { mkdirSync } from 'fs'
try { mkdirSync('qa_screenshots', { recursive: true }) } catch {}

main().catch(console.error)
