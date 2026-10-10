import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const sheets = ['before', 'rare', 'super', 'dup']
for (const n of ['ready', 'norecord', 'drawn', 'empty', ...sheets]) {
  await page.goto(`http://localhost:5199/harness/collection.html#${n}`); await page.reload(); await page.waitForTimeout(800)
  await page.screenshot({ path: `/tmp/coll_${n}.png`, fullPage: !sheets.includes(n) })
  const small = await page.evaluate(() => [...document.querySelectorAll('button:not(:disabled)')].map(e => { const r = e.getBoundingClientRect(); return [e.className, Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w < 44 || h < 44))
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  console.log(n, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
}
await browser.close()
