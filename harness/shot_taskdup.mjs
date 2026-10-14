import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  for (const n of ['tasks', 'tasks_dup', 'tasks_form']) {
    await page.goto(`http://localhost:5199/harness/admin.html#${n}`); await page.reload(); await page.waitForTimeout(800)
    await page.screenshot({ path: `/tmp/td_${n}_${w}.png`, fullPage: true })
    const small = await page.evaluate(() => [...document.querySelectorAll('button, input:not([type=checkbox]):not([type=radio]), select, .choice-face, .adm-all')].map(e => { const r = e.getBoundingClientRect(); return [(e.className || e.tagName) + ':' + (e.textContent||'').slice(0,8), Math.round(r.width), Math.round(r.height)] }).filter(([, ww, hh]) => ww < 44 || hh < 44))
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    console.log(w, n, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
  }
}
await browser.close()
