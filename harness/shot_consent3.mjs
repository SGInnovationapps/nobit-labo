import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
for (const n of ['consent']) {
  await page.goto(`http://127.0.0.1:5199/harness/index.html#${n}`); await page.reload(); await page.waitForTimeout(700)
  await page.screenshot({ path: `/tmp/c3_${n}.png`, fullPage: true })
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input')].map(e => { const r = e.getBoundingClientRect(); return [(e.className || e.tagName), Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w < 44 || h < 44))
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  console.log(n, '44px未満:', JSON.stringify(small), '横スクロール:', ov, '高さ:', h)
}
await browser.close()
