import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const jobs = [[390, 844, 'missions', ['joined', 'notjoined', 'empty']], [1440, 900, 'admin', ['missions', 'missions_empty']], [390, 844, 'admin', ['missions']]]
for (const [w, h, page_, names] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  for (const n of names) {
    await page.goto(`http://localhost:5199/harness/${page_}.html#${n}`); await page.reload(); await page.waitForTimeout(900)
    await page.screenshot({ path: `/tmp/ms_${page_}_${n}_${w}.png`, fullPage: true })
    const small = await page.evaluate(() => [...document.querySelectorAll('button, input, select, summary, .choice-face')].filter(e => e.type !== 'radio' && e.type !== 'checkbox').map(e => { const r = e.getBoundingClientRect(); return [(e.className || e.tagName) + ':' + (e.textContent||'').slice(0,8), Math.round(r.width), Math.round(r.height)] }).filter(([, ww, hh]) => ww < 44 || hh < 44))
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    console.log(w, page_, n, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
  }
}
await browser.close()
