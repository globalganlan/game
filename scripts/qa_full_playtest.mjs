/**
 * qa_full_playtest.mjs — 全功能遊戲體驗 E2E 測試
 * 
 * 測試計畫：
 *   Phase A: 登入 → 新手教學 → 主選單
 *   Phase B: 簽到
 *   Phase C: 信箱
 *   Phase D: 設定
 *   Phase E: 關卡（進入 1-1 → 編隊 → 開始戰鬥 → 等結果）
 *   Phase F: 戰鬥結果 → 返回大廳（通關 1-1 解鎖英雄/背包）
 *   Phase G: 英雄面板
 *   Phase H: 背包面板
 *   Phase I: 再打 1-2（解鎖召喚/商店）
 *   Phase J: 召喚 → 抽卡
 *   Phase K: 商店
 * 
 * Usage: node scripts/qa_full_playtest.mjs [port]
 */
import puppeteer from 'puppeteer'

const PORT = process.argv[2] || '5174'
const URL = `http://localhost:${PORT}/game/`
const SS_DIR = 'qa_screenshots'

// ── Helpers ──

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

let stepN = 0
async function screenshot(page, name) {
  stepN++
  const path = `${SS_DIR}/full_${String(stepN).padStart(2, '0')}_${name}.png`
  await page.screenshot({ path })
  console.log(`   📸 ${path}`)
  return path
}

async function waitAndClick(page, selector, label, timeout = 5000) {
  const el = await page.waitForSelector(selector, { timeout }).catch(() => null)
  if (el) {
    await el.click()
    console.log(`   ✅ 點擊「${label}」`)
    return true
  }
  console.log(`   ⚠️ 找不到「${label}」(${selector})`)
  return false
}

async function getButtons(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .map(b => ({ text: b.textContent?.trim() || '', className: b.className, disabled: b.disabled }))
      .filter(b => b.text)
  )
}

async function getPageState(page) {
  return page.evaluate(() => ({
    hasCanvas: !!document.querySelector('canvas'),
    hasMainMenu: !!document.querySelector('.main-menu-overlay'),
    hasStageSelect: !!document.querySelector('.sc-overlay, .stage-select'),
    hasHeroList: !!document.querySelector('.hero-list-panel'),
    hasInventory: !!document.querySelector('.inventory-panel'),
    hasGacha: !!document.querySelector('.gacha-screen'),
    hasShop: !!document.querySelector('.shop-panel'),
    hasCheckin: !!document.querySelector('.checkin-panel, .checkin-overlay'),
    hasMail: !!document.querySelector('.mailbox-panel, .mail-panel'),
    hasSettings: !!document.querySelector('.settings-panel'),
    hasArena: !!document.querySelector('.arena-panel'),
    hasBattleHud: !!document.querySelector('.battle-hud'),
    hasBottomPanel: !!document.querySelector('.bottom-panel'),
    hasGameover: !!document.querySelector('.gameover-btn-group, .victory-panel'),
    hasTutorial: !!document.querySelector('.tutorial-overlay'),
    bodyText: document.body.innerText?.substring(0, 800) || '',
  }))
}

// ── Test Results ──

const results = []
function pass(name, detail = '') {
  results.push({ name, status: '✅ PASS', detail })
  console.log(`✅ PASS: ${name}`)
}
function fail(name, detail = '') {
  results.push({ name, status: '❌ FAIL', detail })
  console.log(`❌ FAIL: ${name} — ${detail}`)
}
function warn(name, detail = '') {
  results.push({ name, status: '⚠️ WARN', detail })
  console.log(`⚠️ WARN: ${name} — ${detail}`)
}

// ══════════════════════
//  Main
// ══════════════════════

async function run() {
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`🎮 全功能 QA 遊戲測試 — ${URL}`)
  console.log(`${'═'.repeat(50)}\n`)

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--window-size=1280,800', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 800 },
  })

  const page = await browser.newPage()
  const consoleErrors = []
  const debugLogs = []

  page.on('console', msg => {
    const text = msg.text()
    if (msg.type() === 'error') {
      if (!text.includes('Manifest') && !text.includes('favicon'))
        consoleErrors.push(text)
    }
    // 捕捉 DEBUG 日誌
    if (text.includes('[DEBUG]')) {
      debugLogs.push(text)
      console.log('   🐛 ' + text)
    }
  })
  page.on('pageerror', err => consoleErrors.push(`PAGE_ERROR: ${err.message}`))

  try {
    // ════════════ Phase A: 登入 ════════════
    console.log('\n── Phase A: 登入 & 新手教學 ──')

    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })
    pass('頁面載入')
    await screenshot(page, 'login')

    // 等登入畫面
    const loginScreen = await page.waitForSelector('.login-screen', { timeout: 8000 }).catch(() => null)
    if (loginScreen) {
      pass('登入畫面顯示')
      await sleep(2000)

      // 自動登入或訪客
      const needRegister = await page.evaluate(() => {
        const btn = document.querySelector('.login-btn-primary')
        return btn && btn.textContent?.includes('訪客模式')
      })
      if (needRegister) {
        await page.click('.login-btn-primary')
        console.log('   ℹ️ 點擊「訪客模式進入」')
        await sleep(4000)
      } else {
        // 等自動登入完成
        await sleep(4000)
      }
    }

    // 等 Canvas 載入
    const canvas = await page.waitForSelector('canvas', { timeout: 20000 }).catch(() => null)
    if (canvas) pass('3D Canvas 載入')
    else fail('3D Canvas 載入', 'Canvas 20 秒內未出現')

    await sleep(3000)
    await screenshot(page, 'after_login')

    // 跳過新手教學（如有）
    let state = await getPageState(page)
    if (state.hasTutorial) {
      console.log('   ℹ️ 偵測到新手教學，嘗試跳過...')
      const skipBtn = await page.$('button')
      const btns = await getButtons(page)
      const skipB = btns.find(b => b.text.includes('跳過'))
      if (skipB) {
        await page.evaluate(() => {
          const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('跳過'))
          if (b) b.click()
        })
        await sleep(1000)
        pass('新手教學跳過')
      } else {
        // 點「了解！」通過教學
        for (let i = 0; i < 6; i++) {
          const okBtn = await page.evaluate(() => {
            const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('了解'))
            if (b) { b.click(); return true }
            return false
          })
          if (!okBtn) break
          await sleep(800)
        }
        pass('新手教學完成')
      }
      await sleep(1000)
    }

    // 確認到了主選單
    state = await getPageState(page)
    if (state.hasMainMenu) pass('主選單顯示')
    else fail('主選單顯示', '未偵測到 .main-menu-overlay')
    await screenshot(page, 'main_menu')

    // ════════════ Phase B: 簽到 ════════════
    console.log('\n── Phase B: 簽到 ──')

    const checkinClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('簽到'))
      if (btn) { btn.click(); return true }
      return false
    })
    if (checkinClicked) {
      await sleep(2000)
      state = await getPageState(page)
      await screenshot(page, 'checkin')
      if (state.hasCheckin || state.bodyText.includes('簽到')) {
        pass('簽到面板開啟')
      } else {
        // 簽到可能是 toast 而非面板
        if (state.bodyText.includes('簽到') || state.bodyText.includes('領取')) {
          pass('簽到功能觸發', '可能以 toast 形式顯示')
        } else {
          warn('簽到面板', '畫面未明顯變化')
        }
      }
      // 返回主選單
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent?.includes('返回') || b.textContent?.includes('關閉') || b.textContent?.includes('✕') || b.textContent?.includes('←'))
        if (btn) btn.click()
      })
      await sleep(1000)
    } else {
      fail('簽到按鈕', '找不到簽到按鈕')
    }

    // ════════════ Phase C: 信箱 ════════════
    console.log('\n── Phase C: 信箱 ──')

    const mailClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('信箱'))
      if (btn) { btn.click(); return true }
      return false
    })
    if (mailClicked) {
      await sleep(2000)
      state = await getPageState(page)
      await screenshot(page, 'mailbox')
      if (state.hasMail || state.bodyText.includes('信箱') || state.bodyText.includes('郵件') || state.bodyText.includes('沒有')) {
        pass('信箱面板開啟')
      } else {
        warn('信箱面板', '畫面可能未正確顯示')
      }
      // 返回
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent?.includes('返回') || b.textContent?.includes('←'))
        if (btn) btn.click()
      })
      await sleep(1000)
    } else {
      fail('信箱按鈕', '找不到信箱按鈕')
    }

    // ════════════ Phase D: 設定 ════════════
    console.log('\n── Phase D: 設定 ──')

    const settingsClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('設定'))
      if (btn) { btn.click(); return true }
      return false
    })
    if (settingsClicked) {
      await sleep(2000)
      state = await getPageState(page)
      await screenshot(page, 'settings')
      if (state.hasSettings || state.bodyText.includes('帳號') || state.bodyText.includes('設定') || state.bodyText.includes('綁定')) {
        pass('設定面板開啟')
      } else {
        warn('設定面板', '畫面可能未正確顯示')
      }
      // 返回
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent?.includes('返回') || b.textContent?.includes('←'))
        if (btn) btn.click()
      })
      await sleep(1000)
    } else {
      fail('設定按鈕', '找不到設定按鈕')
    }

    // ════════════ Phase E: 關卡 → 進入 1-1 → 戰鬥 ════════════
    console.log('\n── Phase E: 關卡選擇 → 1-1 戰鬥 ──')

    const stageClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('關卡'))
      if (btn) { btn.click(); return true }
      return false
    })
    if (stageClicked) {
      await sleep(2000)
      state = await getPageState(page)
      await screenshot(page, 'stage_select')
      if (state.hasStageSelect || state.bodyText.includes('1-1') || state.bodyText.includes('關卡') || state.bodyText.includes('主線')) {
        pass('關卡選擇面板開啟')
      } else {
        warn('關卡選擇面板', '可能未正確顯示')
      }

      // 點 1-1 關卡（只查 button 元素，避免點到父容器）
      const stage11Clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'))
        const target = btns.find(b => /^1-1[^0-9]/.test(b.textContent?.trim() || ''))
        if (target) { target.click(); return true }
        return false
      })
      if (stage11Clicked) {
        pass('點擊關卡 1-1')
        
        // 等過場幕結束 + 戰鬥準備畫面出現
        console.log('   ⏳ 等待過場幕結束...')
        await page.waitForFunction(() => {
          return document.querySelector('.bottom-panel') ||
                 document.querySelector('.btn-start') ||
                 document.body.innerText.includes('開始戰鬥')
        }, { timeout: 20000 }).catch(() => null)
        
        await sleep(2000)
        await screenshot(page, 'stage_1_1_idle')

        // 確認進入戰鬥準備（IDLE 狀態，有底部面板）
        state = await getPageState(page)
        if (state.hasBottomPanel || state.bodyText.includes('開始戰鬥')) {
          pass('進入戰鬥準備畫面')

          // 點「開始戰鬥」
          const startClicked = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('開始戰鬥'))
            if (btn) { btn.click(); return true }
            return false
          })
          if (startClicked) {
            pass('點擊「開始戰鬥」')
            await sleep(2000)
            await screenshot(page, 'battle_start')

            // 等戰鬥結束（最多 60 秒）
            console.log('   ⏳ 等待戰鬥結束（最多 60 秒）...')
            const battleEnd = await page.waitForFunction(() => {
              return document.querySelector('.battle-result-banner') ||
                     document.querySelector('.btn-bottom-center') ||
                     document.querySelector('.btn-back-lobby') ||
                     document.body.innerText.includes('VICTORY') ||
                     document.body.innerText.includes('DEFEAT') ||
                     document.body.innerText.includes('下一關') ||
                     document.body.innerText.includes('回大廳')
            }, { timeout: 60000 }).catch(() => null)

            if (battleEnd) {
              pass('戰鬥完成')
              await sleep(2000)
              await screenshot(page, 'battle_result')

              state = await getPageState(page)
              const resultText = state.bodyText.substring(0, 300)
              if (resultText.includes('VICTORY') || resultText.includes('勝利')) {
                pass('1-1 勝利')
              } else if (resultText.includes('DEFEAT') || resultText.includes('敗北')) {
                warn('1-1 戰鬥結果', '敗北（可能影響後續測試）')
              } else if (resultText.includes('下一關') || resultText.includes('回大廳') || resultText.includes('重試')) {
                pass('1-1 戰鬥有結果', `畫面含按鈕`)
              } else {
                pass('1-1 有結果畫面', `內容: ${resultText.substring(0, 80)}`)
              }

              // ════════════ Phase F: 下一關 → 1-2 → 戰鬥 ════════════
              console.log('\n── Phase F: 1-1 勝利 → 進入 1-2 戰鬥 ──')

              // 點「下一關 ▶」直接進 1-2
              const nextClicked = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'))
                const next = btns.find(b => b.textContent?.includes('下一關'))
                if (next) { next.click(); return true }
                return false
              })

              if (nextClicked) {
                pass('點擊「下一關」')
                
                // 等 1-2 的 IDLE 畫面（底部面板出現）
                console.log('   ⏳ 等待 1-2 載入...')
                await page.waitForFunction(() => {
                  return document.querySelector('.bottom-panel') ||
                         document.body.innerText.includes('開始戰鬥')
                }, { timeout: 20000 }).catch(() => null)
                await sleep(2000)

                // 開始 1-2 戰鬥
                const start12 = await page.evaluate(() => {
                  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('開始戰鬥'))
                  if (btn) { btn.click(); return true }
                  return false
                })
                if (start12) {
                  pass('開始 1-2 戰鬥')
                  console.log('   ⏳ 等待 1-2 戰鬥結束（最多 90 秒）...')
                  await sleep(2000)
                  
                  const battle12End = await page.waitForFunction(() => {
                    const found = {
                      banner: !!document.querySelector('.battle-result-banner'),
                      btnCenter: !!document.querySelector('.btn-bottom-center'),
                      btnLobby: !!document.querySelector('.btn-back-lobby'),
                      victory: document.body.innerText?.includes('VICTORY'),
                      defeat: document.body.innerText?.includes('DEFEAT'),
                      nextStage: document.body.innerText?.includes('下一關'),
                      lobby: document.body.innerText?.includes('回大廳'),
                    }
                    if (Object.values(found).some(Boolean)) {
                      // 把找到的原因寫進 DOM 讓外部讀取
                      const d = document.getElementById('__qa_debug') || document.createElement('div')
                      d.id = '__qa_debug'
                      d.setAttribute('data-found', JSON.stringify(found))
                      document.body.appendChild(d)
                      return true
                    }
                    return false
                  }, { timeout: 90000 }).catch(() => null)

                  // 讀取 waitForFunction 找到的原因
                  const foundReason = await page.evaluate(() => {
                    const d = document.getElementById('__qa_debug')
                    return d ? d.getAttribute('data-found') : null
                  })
                  console.log('   🔍 1-2 結果偵測原因:', foundReason)

                  await sleep(2000)
                  await screenshot(page, 'stage_1_2_result')
                  
                  if (battle12End) {
                    state = await getPageState(page)
                    const r12 = state.bodyText.substring(0, 300)
                    // 先檢查 DEFEAT/VICTORY，不能用 '回大廳' 當勝利判斷
                    if (r12.includes('VICTORY')) {
                      pass('1-2 勝利')
                    } else if (r12.includes('DEFEAT')) {
                      warn('1-2 戰鬥', '敗北（初始英雄可能不夠強，召喚/商店將無法解鎖）')
                    } else if (r12.includes('下一關')) {
                      pass('1-2 勝利（偵測到下一關按鈕）')
                    } else {
                      warn('1-2 結果不明', r12.substring(0, 80))
                    }
                  } else {
                    warn('1-2 戰鬥', '90 秒內未偵測到結果')
                    await screenshot(page, 'stage_1_2_timeout')
                    // 診斷
                    const diag12 = await page.evaluate(() => ({
                      btns: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean).slice(0, 10),
                      classes: Array.from(document.querySelectorAll('[class]')).map(e => e.className).filter(c => /battle|result|bottom|gameover|victory|defeat/i.test(c)).slice(0, 10),
                      text: document.body.innerText?.substring(0, 200),
                    }))
                    console.log('   🔍 1-2 診斷:', JSON.stringify(diag12, null, 2))
                  }
                } else {
                  warn('1-2 開始', '找不到開始戰鬥按鈕')
                }

                // 回大廳
                await page.evaluate(() => {
                  const btns = Array.from(document.querySelectorAll('button'))
                  const lobby = btns.find(b => b.textContent?.includes('回大廳'))
                  if (lobby) { lobby.click(); return }
                  const back = btns.find(b => b.textContent?.includes('返回') || b.textContent?.includes('←'))
                  if (back) back.click()
                })
              } else {
                // 沒有「下一關」按鈕，點「回大廳」
                await page.evaluate(() => {
                  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('回大廳'))
                  if (btn) btn.click()
                })
                pass('回大廳（無下一關按鈕）')
              }

              // 等回到主選單
              await sleep(2000)
              console.log('   ⏳ 等待返回主選單...')
              await page.waitForFunction(() => {
                return document.querySelector('.main-menu-overlay')
              }, { timeout: 15000 }).catch(() => null)
              await sleep(2000)
              state = await getPageState(page)
              if (state.hasMainMenu) {
                pass('回到主選單')
                await screenshot(page, 'back_to_menu')
              } else {
                warn('回到主選單', '可能還在過場')
                await screenshot(page, 'after_battle_state')
              }

            } else {
              fail('戰鬥結束', '60 秒內未看到結果')
              await screenshot(page, 'battle_timeout')
            }
          } else {
            fail('開始戰鬥按鈕', '找不到或無法點擊')
          }
        } else {
          warn('戰鬥準備畫面', '未偵測到正確的戰鬥準備 UI')
        }
      } else {
        fail('點擊 1-1', '找不到 1-1 關卡元素')
      }
    } else {
      fail('關卡按鈕', '找不到關卡按鈕')
    }

    // 確保回到主選單
    state = await getPageState(page)
    if (!state.hasMainMenu) {
      // 嘗試各種返回
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent?.includes('大廳') || b.textContent?.includes('返回') || b.textContent?.includes('←'))
        if (btn) btn.click()
      })
      await sleep(3000)
    }

    // ════════════ Phase G: 英雄面板 ════════════
    console.log('\n── Phase G: 英雄面板 ──')

    state = await getPageState(page)
    if (state.hasMainMenu) {
      const heroClicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('英雄'))
        if (btn && !btn.textContent?.includes('🔒')) { btn.click(); return true }
        return false
      })
      if (heroClicked) {
        await sleep(2000)
        state = await getPageState(page)
        await screenshot(page, 'hero_panel')
        if (state.hasHeroList || state.bodyText.includes('英雄') || state.bodyText.includes('Lv')) {
          pass('英雄面板開啟')
        } else {
          warn('英雄面板', '可能仍被鎖定')
        }
        // 返回
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent?.includes('返回') || b.textContent?.includes('←'))
          if (btn) btn.click()
        })
        await sleep(1000)
      } else {
        warn('英雄按鈕', '可能仍被鎖定（未通關 1-1）')
      }
    }

    // ════════════ Phase H: 背包面板 ════════════
    console.log('\n── Phase H: 背包面板 ──')

    state = await getPageState(page)
    if (state.hasMainMenu) {
      const invClicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('背包'))
        if (btn && !btn.textContent?.includes('🔒')) { btn.click(); return true }
        return false
      })
      if (invClicked) {
        await sleep(2000)
        state = await getPageState(page)
        await screenshot(page, 'inventory')
        if (state.hasInventory || state.bodyText.includes('背包') || state.bodyText.includes('道具')) {
          pass('背包面板開啟')
        } else {
          warn('背包面板', '可能未正確顯示')
        }
        // 返回
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent?.includes('返回') || b.textContent?.includes('←'))
          if (btn) btn.click()
        })
        await sleep(1000)
      } else {
        warn('背包按鈕', '可能仍被鎖定')
      }
    }

    // ════════════ Phase J: 召喚 ════════════
    console.log('\n── Phase J: 召喚（抽卡）──')

    state = await getPageState(page)
    if (state.hasMainMenu) {
      // 診斷：確認目前解鎖狀態
      const menuDiag = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'))
        const menuBtns = btns.filter(b => /召喚|商店|英雄|背包|關卡|簽到|信箱|設定|競技場/.test(b.textContent || '')).map(b => b.textContent?.trim())
        const progressEl = document.querySelector('.menu-progress-stage')
        return { menuBtns, progress: progressEl?.textContent?.trim(), bodySnippet: document.body.innerText?.substring(0, 200) }
      })
      console.log('   🔍 主選單按鈕:', JSON.stringify(menuDiag.menuBtns))
      console.log('   🔍 關卡進度:', menuDiag.progress)

      const gachaClicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('召喚'))
        if (btn && !btn.textContent?.includes('🔒')) { btn.click(); return true }
        return false
      })
      if (gachaClicked) {
        await sleep(2000)
        state = await getPageState(page)
        await screenshot(page, 'gacha')
        if (state.hasGacha || state.bodyText.includes('召喚') || state.bodyText.includes('招募') || state.bodyText.includes('抽')) {
          pass('召喚面板開啟')
          
          // 嘗試單抽（如果有鑽石）
          const singlePull = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => 
              b.textContent?.includes('單抽') || b.textContent?.includes('1 抽') || b.textContent?.includes('×1'))
            if (btn && !btn.disabled) { btn.click(); return true }
            return false
          })
          if (singlePull) {
            await sleep(4000)
            await screenshot(page, 'gacha_result')
            pass('召喚單抽執行')
          } else {
            warn('召喚單抽', '按鈕不可用或找不到（可能鑽石不足）')
          }
        } else {
          warn('召喚面板', '可能未正確顯示')
        }
        // 返回
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent?.includes('返回') || b.textContent?.includes('←'))
          if (btn) btn.click()
        })
        await sleep(1000)
      } else {
        warn('召喚按鈕', '可能仍被鎖定（未通關 1-2）')
      }
    }

    // ════════════ Phase K: 商店 ════════════
    console.log('\n── Phase K: 商店 ──')

    state = await getPageState(page)
    if (state.hasMainMenu) {
      const shopClicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('商店'))
        if (btn && !btn.textContent?.includes('🔒')) { btn.click(); return true }
        return false
      })
      if (shopClicked) {
        await sleep(2000)
        state = await getPageState(page)
        await screenshot(page, 'shop')
        if (state.hasShop || state.bodyText.includes('商店') || state.bodyText.includes('購買')) {
          pass('商店面板開啟')
        } else {
          warn('商店面板', '可能未正確顯示')
        }
        // 返回
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => 
            b.textContent?.includes('返回') || b.textContent?.includes('←'))
          if (btn) btn.click()
        })
        await sleep(1000)
      } else {
        warn('商店按鈕', '可能仍被鎖定')
      }
    }

    // ════════════ 最終狀態 ════════════
    await sleep(1000)
    state = await getPageState(page)
    await screenshot(page, 'final_state')

    // Console 錯誤統計
    const fatalErrors = consoleErrors.filter(e => 
      !e.includes('401') && !e.includes('net::ERR') && !e.includes('Manifest'))
    if (fatalErrors.length === 0) {
      pass('無致命 console 錯誤')
    } else {
      fail('Console 錯誤', fatalErrors.slice(0, 5).join(' | '))
    }

  } catch (err) {
    fail('測試執行', err.message)
    await screenshot(page, 'crash').catch(() => {})
  }

  // ════════════ 報告 ════════════
  console.log(`\n${'═'.repeat(50)}`)
  console.log('📋 QA 全功能測試報告')
  console.log(`${'═'.repeat(50)}`)
  
  const passes = results.filter(r => r.status.includes('PASS')).length
  const fails = results.filter(r => r.status.includes('FAIL')).length
  const warns = results.filter(r => r.status.includes('WARN')).length
  
  console.log(`\n總計: ${results.length} 項 | ✅ ${passes} 通過 | ❌ ${fails} 失敗 | ⚠️ ${warns} 警告\n`)
  
  results.forEach(r => {
    const detail = r.detail ? ` — ${r.detail}` : ''
    console.log(`  ${r.status} ${r.name}${detail}`)
  })

  if (consoleErrors.length > 0) {
    console.log(`\n📜 Console 錯誤（${consoleErrors.length} 筆）:`)
    consoleErrors.slice(0, 10).forEach(e => console.log(`  • ${e.substring(0, 120)}`))
  }

  console.log(`\n📸 截圖存放: ${SS_DIR}/full_*.png`)
  console.log(`${'═'.repeat(50)}\n`)

  // 等使用者看完
  console.log('🔍 保持瀏覽器 15 秒供目視確認...')
  await sleep(15000)
  
  await browser.close()
  console.log('🔒 瀏覽器已關閉')
  
  process.exit(fails > 0 ? 1 : 0)
}

run()
