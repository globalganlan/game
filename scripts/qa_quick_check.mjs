import puppeteer from 'puppeteer'

const TOKEN = 'aedc3705-6706-4db5-8d53-41488c5f1598' // P0002 test account

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu'], timeout: 60000 })
const p = await b.newPage()
await p.setViewport({ width: 1280, height: 800 })

// Set guest token BEFORE navigating so autoLogin uses it
await p.evaluateOnNewDocument((t) => {
  localStorage.setItem('globalganlan_guest_token', t)
}, TOKEN)

const errors = []
p.on('pageerror', e => errors.push(e.message))
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await p.goto('http://localhost:5174/game/', { waitUntil: 'networkidle2', timeout: 60000 })
// Wait for login + loadSave + rendering
await new Promise(r => setTimeout(r, 15000))

// Click the enter/play button on login screen
const loginBtns = await p.$$eval('button', bs => bs.map(b => ({ text: b.textContent?.trim(), cls: b.className })))
console.log('Login screen buttons:', JSON.stringify(loginBtns))
for (const btn of await p.$$('button')) {
  const txt = await p.evaluate(el => el.textContent?.trim(), btn)
  if (txt && (txt.includes('進入') || txt.includes('開始') || txt.includes('遊戲') || txt.includes('Play'))) {
    console.log('Clicking:', txt)
    await btn.click()
    break
  }
}

// Poll until main menu appears or timeout
const deadline = Date.now() + 120000
let foundMenu = false
while (Date.now() < deadline) {
  const txt = await p.evaluate(() => document.body.innerText)
  if (txt.includes('關卡進度') || txt.includes('召喚') || txt.includes('背包')) {
    foundMenu = true
    break
  }
  const pct = txt.match(/(\d+)%/)
  if (pct) process.stdout.write(`\rLoading: ${pct[1]}%`)
  await new Promise(r => setTimeout(r, 2000))
}
console.log(foundMenu ? '\nMain menu reached!' : '\nTimeout waiting for main menu')

const text = await p.evaluate(() => document.body.innerText)
console.log('--- PAGE TEXT (first 500 chars) ---')
console.log(text.substring(0, 500))
console.log('--- END ---')
const match = text.match(/關卡進度[：:]\s*(\S+)/)
console.log('關卡進度:', match ? match[1] : 'NOT FOUND in page')
console.log('has undefined:', text.includes('undefined-undefined'))

const gameErrors = errors.filter(e => !e.includes('WebGL') && !e.includes('favicon'))
console.log('JS errors:', gameErrors.length > 0 ? gameErrors.slice(0, 3).join(' | ') : 'none')

// Test gacha
const btns = await p.$$eval('button', bs => bs.map(b => b.textContent?.trim()))
const gi = btns.findIndex(t => t && t.includes('召喚'))
if (gi >= 0) {
  const allBtns = await p.$$('button')
  await allBtns[gi].click()
  await new Promise(r => setTimeout(r, 2000))
  const sb = await p.$('.gacha-pull-single')
  if (sb) {
    const dis = await p.evaluate(el => el.disabled, sb)
    if (!dis) {
      await sb.click()
      await new Promise(r => setTimeout(r, 500))
    }
    const has = await p.evaluate(() => !!document.querySelector('.gacha-results-overlay'))
    console.log('gacha pull:', has ? '✅ OK' : dis ? '⚠️ disabled (no diamond)' : '❌ FAIL')
  }
} else {
  console.log('gacha btn: not found')
}

await b.close()
console.log('QA done')
