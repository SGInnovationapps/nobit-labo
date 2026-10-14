import { chromium } from 'playwright-core'
import fs from 'node:fs'
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath: exe ?? undefined, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const names = ['consent', 'consent_error', 'profile', 'profile_filled', 'waiting', 'need_invite']
for (const n of names) {
  await page.goto(`http://localhost:5199/harness/index.html#${n}`)
  await page.reload()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `/tmp/shot_${n}.png`, fullPage: true })
}
// タップ領域の確認
await page.goto('http://localhost:5199/harness/index.html#profile_filled'); await page.reload(); await page.waitForTimeout(400)
const small = await page.evaluate(() => [...document.querySelectorAll('button, input[type=text], .choice-face')].map(e => { const r = e.getBoundingClientRect(); return [e.className || e.tagName, Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w < 44 || h < 44))
console.log('44px未満:', JSON.stringify(small))
await page.goto('http://localhost:5199/harness/index.html#consent'); await page.reload(); await page.waitForTimeout(400)
console.log('同意ボタン disabled:', await page.locator('button.btn-primary').isDisabled())
await page.locator('.agree').click()
console.log('チェック後 disabled:', await page.locator('button.btn-primary').isDisabled())
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
console.log('横スクロール:', overflow)
await browser.close()
