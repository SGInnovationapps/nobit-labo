import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
for (const n of ['ready', 'empty', 'sheet_badge']) {
  await page.goto(`http://localhost:5199/harness/collection.html#${n}`); await page.reload(); await page.waitForTimeout(900)
  await page.screenshot({ path: `/tmp/bd_${n}.png`, fullPage: true })
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].map(e => { const r = e.getBoundingClientRect(); return [(e.className || e.tagName) + ':' + (e.textContent||'').slice(0,8), Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w < 44 || h < 44))
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  console.log(n, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
}
const a = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await a.goto('http://localhost:5199/harness/admin.html#student_detail_op'); await a.reload(); await a.waitForTimeout(800)
await a.screenshot({ path: '/tmp/bd_admin_op.png', fullPage: true })
const t = await a.evaluate(() => document.body.innerText)
console.log('運営にバッジ:', t.includes('7日連続'), '数学のはじめて:', t.includes('数学のはじめて'))
await browser.close()
