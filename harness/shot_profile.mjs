import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
for (const n of ['profile', 'profile_line', 'profile_filled']) {
  await page.goto(`http://localhost:5199/harness/index.html#${n}`); await page.reload(); await page.waitForTimeout(700)
  await page.screenshot({ path: `/tmp/pf_${n}.png`, fullPage: true })
  const small = await page.evaluate(() => [...document.querySelectorAll('button, input[type=text], .choice-face')].map(e => { const r = e.getBoundingClientRect(); return [(e.className || e.tagName) + ':' + (e.textContent||'').slice(0,8), Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w < 44 || h < 44))
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  const name = await page.evaluate(() => document.querySelector('#display-name')?.value)
  console.log(n, '44px未満:', JSON.stringify(small), '横スクロール:', ov, '表示名の初期値:', JSON.stringify(name))
}
await browser.close()
