/**
 * Safe-area E2E quick check — 驗證所有介面有 safe-area 處理
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:5188/game/';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-gpu', '--disable-web-security']
    });
    const page = await browser.newPage();
    // Emulate iPhone 14 Pro with notch
    await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    console.log('📱 模擬 iPhone 14 Pro (393×852)');

    // Fetch the built CSS and check safe-area rules
    console.log('\n=== CSS safe-area 規則檢查 ===');
    
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    
    const cssCheck = await page.evaluate(() => {
      const results = [];
      const selectors = [
        '.game-hud',
        '.login-screen',
        '.main-menu-overlay',
        '.panel-overlay',
        '.hero-detail-backdrop',
        '.arena-panel',
        '.battle-prep-top-banner',
        '.battle-result-banner',
        '.boss-dmg-bar-wrap',
        '.bhud-skill-toasts'
      ];
      
      // Check all stylesheets for safe-area references
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText && rule.cssText.includes('safe-area')) {
              const sel = rule.selectorText;
              if (selectors.some(s => sel?.includes(s.replace('.', '')))) {
                results.push({ selector: sel, hasSafeArea: true });
              }
            }
          }
        } catch (e) { /* cross-origin */ }
      }
      return results;
    });
    
    console.log(`找到 ${cssCheck.length} 個含 safe-area 的規則：`);
    cssCheck.forEach(r => console.log(`  ✅ ${r.selector}`));

    // Check expected selectors
    const expected = [
      '.game-hud', '.login-screen', '.main-menu-overlay', '.panel-overlay',
      '.hero-detail-backdrop', '.arena-panel', '.battle-prep-top-banner',
      '.battle-result-banner', '.boss-dmg-bar-wrap', '.bhud-skill-toasts'
    ];
    
    const found = cssCheck.map(r => r.selector);
    const missing = expected.filter(s => !found.some(f => f?.includes(s.replace('.', ''))));

    if (missing.length > 0) {
      console.log('\n⚠️ 以下選擇器未找到 safe-area 規則：');
      missing.forEach(s => console.log(`  ❌ ${s}`));
    } else {
      console.log('\n🎉 所有 10 個介面都有 safe-area-inset-top 規則！');
    }

    // 1. Login screen
    console.log('\n=== 畫面測試 ===');
    const loginVisible = await page.evaluate(() => {
      return document.querySelector('.login-screen') !== null;
    });
    console.log(`${loginVisible ? '✅' : '❌'} 登入畫面已載入`);

    // 2. Guest login
    const btn = await page.$('button');
    if (btn) await btn.click();
    await sleep(5000);

    // 3. Check main menu
    const menuVisible = await page.evaluate(() => {
      return document.querySelector('.main-menu-overlay') !== null;
    });
    console.log(`${menuVisible ? '✅' : '❌'} 主選單`);

    // 4. Try arena
    const arenaClicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, [class*="menu"]')];
      const arena = btns.find(b => b.textContent?.includes('競技場'));
      if (arena) { arena.click(); return true; }
      return false;
    });
    await sleep(2000);
    
    const arenaPanel = await page.evaluate(() => {
      return document.querySelector('.arena-panel') !== null;
    });
    console.log(`${arenaPanel ? '✅' : '⚠️'} 競技場面板`);

    // Check for critical JS errors
    const critErrors = errors.filter(e => e.includes('Uncaught') || e.includes('Cannot read'));
    console.log(`\n${critErrors.length === 0 ? '✅' : '❌'} JS 錯誤: ${errors.length} 總, ${critErrors.length} 嚴重`);

    console.log('\n=== 完成 ===');

  } catch (err) {
    console.error('錯誤:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

main();
