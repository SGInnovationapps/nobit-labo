import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const adm = ['approvals', 'events', 'alertlist', 'students', 'students_admin', 'student_detail']
const home = ['ticket_use', 'ticket_zero', 'quest_done', 'partial']
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  for (const n of adm) {
    await page.goto(`http://localhost:5199/harness/admin.html#${n}`); await page.reload(); await page.waitForTimeout(800)
    await page.screenshot({ path: `/tmp/b_adm_${n}_${w}.png`, fullPage: true })
    const small = await page.evaluate(() => [...document.querySelectorAll('button, input:not([type=checkbox]):not([type=radio]), select, .choice-face, .adm-check')].map(e => { const r = e.getBoundingClientRect(); return [(e.className || e.tagName) + ':' + (e.textContent||'').slice(0,8), Math.round(r.width), Math.round(r.height)] }).filter(([, ww, hh]) => ww < 44 || hh < 44))
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    console.log(w, n, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
  }
  await page.close()
}
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
for (const n of home) {
  await page.goto(`http://localhost:5199/harness/home.html#${n}`); await page.reload(); await page.waitForTimeout(900)
  await page.screenshot({ path: `/tmp/b_home_${n}.png`, fullPage: true })
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input[type=text], .choice-face')].map(e => { const r = e.getBoundingClientRect(); return [(e.className || e.tagName) + ':' + (e.textContent||'').slice(0,8), Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w < 44 || h < 44))
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  console.log('home', n, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
}
await browser.close()
