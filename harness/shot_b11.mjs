import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const jobs = [['collection', ['ready', 'contact_off'], [390]], ['admin', ['alertlist', 'student_detail_op'], [1440, 390]]]
for (const [file, names, widths] of jobs) for (const w of widths) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 })
  for (const n of names) {
    await page.goto(`http://localhost:5199/harness/${file}.html#${n}`); await page.reload(); await page.waitForTimeout(700)
    await page.screenshot({ path: `/tmp/b11_${file}_${n}_${w}.png`, fullPage: true })
    const small = await page.evaluate(() => [...document.querySelectorAll('button, input:not([type=radio]), select, textarea, label.choice')].map(e => { const r = e.getBoundingClientRect(); return [(e.id || e.className || e.tagName) + ':' + (e.textContent||'').slice(0,8), Math.round(r.width), Math.round(r.height)] }).filter(([, ww, hh]) => hh < 44))
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    console.log(file, n, w, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
  }
}
await browser.close()
