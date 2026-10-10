import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
for (const n of ['partial', 'none', 'all', 'empty', 'sheet', 'free', 'tagged', 'timerSheet', 'timerRunning', 'focusSheet', 'focusRunning', 'focusPaused']) {
  await page.goto(`http://localhost:5199/harness/home.html#${n}`); await page.reload(); await page.waitForTimeout(1200)
  await page.screenshot({ path: `/tmp/home_${n}.png`, fullPage: !['sheet','free','timerSheet','focusSheet'].includes(n) })
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input[type=text], .choice-face')].map(e => { const r = e.getBoundingClientRect(); return [e.className || e.tagName, Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w < 44 || h < 44))
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  console.log(n, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
}
await browser.close()
