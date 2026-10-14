import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const jobs = [['approvals', 1440, 900], ['clubs', 1440, 900], ['approvals', 390, 844], ['clubs', 390, 844], ['login', 390, 700]]
for (const [n, w, h] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await page.goto(`http://localhost:5199/harness/admin.html#${n}`); await page.reload(); await page.waitForTimeout(700)
  await page.screenshot({ path: `/tmp/adm_${n}_${w}.png`, fullPage: true })
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input, select')].map(e => { const r = e.getBoundingClientRect(); return [e.textContent?.trim().slice(0,12) || e.id, Math.round(r.width), Math.round(r.height)] }).filter(([, bw, bh]) => (bw < 44 || bh < 44) && bw > 1))
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  console.log(n, w, '44px未満:', JSON.stringify(small), '横スクロール:', over)
  await page.close()
}
await browser.close()
