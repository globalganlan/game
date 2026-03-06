/**
 * Arena Redesign E2E Test — Puppeteer
 * 測試：登入 → 大廳 → 競技場 → 確認新 UI（Top 10 + 挑戰對手 + 刷新按鈕）
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:5187/game/';
const TIMEOUT = 60000;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForText(page, text, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const content = await page.evaluate(() => document.body?.innerText || '');
    if (content.includes(text)) return true;
    await sleep(500);
  }
  return false;
}

async function main() {
  const results = [];
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-web-security']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Collect console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    // 1. Navigate to game
    console.log('1. 載入遊戲頁面...');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: TIMEOUT });
    const loginFound = await waitForText(page, '訪客模式進入');
    results.push({ test: '遊戲頁面載入', pass: loginFound });
    console.log(`   ${loginFound ? '✅' : '❌'} 登入頁面`);

    if (!loginFound) {
      console.log('❌ 無法載入遊戲，終止測試');
      return;
    }

    // 2. Guest login
    console.log('2. 訪客登入...');
    const guestBtn = await page.$('button');
    if (guestBtn) await guestBtn.click();
    await sleep(3000);

    // Wait for lobby or loading to finish
    let inLobby = false;
    for (let i = 0; i < 20; i++) {
      const text = await page.evaluate(() => document.body?.innerText || '');
      if (text.includes('競技場') || text.includes('冒險') || text.includes('抽卡') || text.includes('背包')) {
        inLobby = true;
        break;
      }
      await sleep(1500);
    }
    results.push({ test: '進入大廳', pass: inLobby });
    console.log(`   ${inLobby ? '✅' : '❌'} 大廳`);

    if (!inLobby) {
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      console.log('   當前畫面:', bodyText.substring(0, 200));
      console.log('❌ 無法進入大廳，終止測試');
      return;
    }

    // 3. Navigate to Arena
    console.log('3. 進入競技場...');
    // Find and click arena button
    const arenaClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const arenaBtn = buttons.find(b => b.textContent?.includes('競技場'));
      if (arenaBtn) { arenaBtn.click(); return true; }
      return false;
    });
    
    if (!arenaClicked) {
      // Try clicking via nav or other elements
      const clicked2 = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('*'));
        const el = els.find(e => e.textContent?.trim() === '競技場' && e.offsetParent !== null);
        if (el) { el.click(); return true; }
        return false;
      });
      results.push({ test: '點擊競技場', pass: clicked2 });
      console.log(`   ${clicked2 ? '✅' : '❌'} 點擊競技場按鈕`);
    } else {
      results.push({ test: '點擊競技場', pass: true });
      console.log('   ✅ 點擊競技場按鈕');
    }

    await sleep(3000);

    // 4. Check Arena UI elements
    console.log('4. 檢查競技場 UI...');
    const arenaText = await page.evaluate(() => document.body?.innerText || '');
    
    // Check for key UI elements
    const hasRankings = arenaText.includes('排行榜') || arenaText.includes('Top 10') || arenaText.includes('TOP');
    const hasOpponents = arenaText.includes('挑戰對手') || arenaText.includes('挑戰');
    const hasRefresh = arenaText.includes('刷新');
    const hasMyRank = arenaText.includes('排名') || arenaText.includes('名次');
    
    results.push({ test: '排行榜區塊', pass: hasRankings });
    results.push({ test: '挑戰對手區塊', pass: hasOpponents });
    results.push({ test: '刷新按鈕', pass: hasRefresh });
    results.push({ test: '排名顯示', pass: hasMyRank });
    
    console.log(`   ${hasRankings ? '✅' : '❌'} 排行榜區塊`);
    console.log(`   ${hasOpponents ? '✅' : '❌'} 挑戰對手區塊`);
    console.log(`   ${hasRefresh ? '✅' : '❌'} 刷新按鈕`);
    console.log(`   ${hasMyRank ? '✅' : '❌'} 排名顯示`);

    // 5. Check for no white screen / critical errors
    const hasCriticalError = consoleErrors.some(e => 
      e.includes('Uncaught') || e.includes('ChunkLoadError') || e.includes('Cannot read properties')
    );
    results.push({ test: '無重大 JS 錯誤', pass: !hasCriticalError });
    console.log(`   ${!hasCriticalError ? '✅' : '❌'} 無重大 JS 錯誤`);
    
    if (consoleErrors.length > 0) {
      console.log(`   ⚠️ Console errors (${consoleErrors.length}):`);
      consoleErrors.slice(0, 5).forEach(e => console.log(`     - ${e.substring(0, 100)}`));
    }

    // Take screenshot
    await page.screenshot({ path: 'D:/GlobalGanLan/qa_screenshots/arena_redesign.png', fullPage: false });
    console.log('   📸 截圖已存: qa_screenshots/arena_redesign.png');

    // Summary
    console.log('\n========== 測試結果 ==========');
    const passed = results.filter(r => r.pass).length;
    const total = results.length;
    results.forEach(r => console.log(`${r.pass ? '✅' : '❌'} ${r.test}`));
    console.log(`\n通過: ${passed}/${total}`);
    console.log(passed === total ? '🎉 全部通過！' : '⚠️ 有失敗項目');

  } catch (err) {
    console.error('測試錯誤:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

main();
