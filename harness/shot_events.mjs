import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  for (const n of ['events', 'events_empty']) {
    await page.goto(`http://localhost:5199/harness/admin.html#${n}`); await page.reload(); await page.waitForTimeout(900)
    await page.screenshot({ path: `/tmp/ev_${n}_${w}.png`, fullPage: true })
    const small = await page.evaluate(() => [...document.querySelectorAll('button, input, select, .choice-face')].filter(e => e.type !== 'radio' && e.type !== 'checkbox').map(e => { const r = e.getBoundingClientRect(); return [(e.className || e.tagName) + ':' + (e.textContent||'').slice(0,8), Math.round(r.width), Math.round(r.height)] }).filter(([, ww, hh]) => ww < 44 || hh < 44))
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    console.log(w, n, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
  }
}
await browser.close()
