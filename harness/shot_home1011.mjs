// v1.7 ホーム（10/11 改訂）の確認：状態ごとの最初の画面・シート・トグル。開発サーバー（ポート 5199）を起動してから実行する
import { chromium } from 'playwright-core'
const out = process.argv[2] ?? '/tmp'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const shot = async (name, full = false) => {
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].map((e) => { const r = e.getBoundingClientRect(); return [(e.textContent || '').trim().slice(0, 10), Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w > 0 && (w < 44 || h < 44)))
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  console.log(name, '44px未満:', JSON.stringify(small), '横スクロール:', ov)
  await page.screenshot({ path: `${out}/h_${name}.png`, fullPage: full })
}
for (const n of ['s_first', 's_notyet', 's_recording', 's_recording4', 's_done_gacha', 's_resume']) {
  await page.goto(`http://localhost:5199/harness/home.html#${n}`); await page.reload(); await page.waitForTimeout(900)
  await page.evaluate(() => localStorage.clear())
  await shot(n)
}
await page.goto('http://localhost:5199/harness/home.html#s_recording4'); await page.reload(); await page.waitForTimeout(700)
await page.getByRole('button', { name: /ほか.件を表示/ }).click(); await page.waitForTimeout(300); await shot('toggle_open')
await page.getByRole('button', { name: '教科を記録する' }).click(); await page.waitForTimeout(300); await shot('sheet_subjects')
await page.getByRole('button', { name: '閉じる' }).click()
await page.getByRole('button', { name: /タスクを見る/ }).click(); await page.waitForTimeout(300); await shot('sheet_tasks')
await page.goto('http://localhost:5199/harness/home.html#s_notyet'); await page.reload(); await page.waitForTimeout(700); await shot('notyet_full', true)
await browser.close()
