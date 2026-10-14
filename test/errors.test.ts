import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describe, deviceOf, isNoise, makeReport, pathOf, redact, ReportGate } from '../src/lib/errorReport.ts'
import { clientErrorMeta, clientErrorNote, stampOf } from '../src/admin/clientErrorsModel.ts'
import type { ClientErrorItem } from '../src/admin/clientErrorsModel.ts'

const IOS_LINE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.2.0 LIFF'
const ANDROID_LINE = 'Mozilla/5.0 (Linux; Android 14; SH-M26 Build/S1234; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Line/15.1.0/IAB'
const env = { href: 'https://nobit.example/?liff.state=%2F&code=abc#access_token=xyz', userAgent: IOS_LINE, appVersion: 'abc1234' }

test('長い英数字とメールアドレスは伏せる', () => {
  assert.equal(redact('token eyJhbGciOiJIUzI1NiJ9abcdefghijkl.eyJzdWIiOiIxMjM0NTY3ODkwIn0x.SflKxwRJSMeKKF2QT4fwpM end'), 'token […] end')
  assert.equal(redact('mail to nobi@example.co.jp now'), 'mail to [mail] now')
  assert.equal(redact('TypeError: x is undefined'), 'TypeError: x is undefined')
})

test('パスだけを取り出す（? と # は送らない）', () => {
  assert.equal(pathOf(env.href), '/')
  assert.equal(pathOf('https://nobit.example/admin/x?y=1'), '/admin/x')
  assert.equal(pathOf('not a url'), null)
})

test('端末は OS と LINE の版だけ', () => {
  assert.equal(deviceOf(IOS_LINE), 'iOS 18.1 · LINE 15.2.0')
  assert.equal(deviceOf(ANDROID_LINE), 'Android 14 · LINE 15.1.0')
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'), 'Windows · Chrome')
  assert.equal(deviceOf(''), null)
})

test('Error と Supabase のエラーから文面を作る。それ以外は送らない', () => {
  assert.deepEqual(describe(new TypeError('x is undefined'))?.message, 'TypeError: x is undefined')
  assert.equal(describe(new Error(''))?.message, '(no message)')
  assert.deepEqual(describe({ message: 'permission denied', code: '42501' }), { message: '[42501] permission denied', stack: null })
  assert.deepEqual(describe({ message: 'Failed to fetch', status: 0 }), { message: '[0] Failed to fetch', stack: null })
  assert.equal(describe('just a string'), null)
  assert.equal(describe(null), null)
})

test('意味のないエラーは送らない', () => {
  assert.equal(isNoise('Script error.', null), true)
  assert.equal(isNoise('AbortError: The user aborted a request.', null), true)
  assert.equal(isNoise('boom', 'at chrome-extension://abc/x.js:1:1'), true)
  assert.equal(isNoise('TypeError: x', 'at Home (index.js:1:1)'), false)
})

test('送る形にまとめる', () => {
  const r = makeReport('student', 'handled', new Error('saved failed'), env)
  assert.deepEqual(r, {
    app: 'student', kind: 'handled', message: 'saved failed', stack: r?.stack ?? null, path: '/', device: 'iOS 18.1 · LINE 15.2.0', appVersion: 'abc1234',
  })
  assert.equal(makeReport('student', 'error', 'not an error', env), null)
  assert.equal(makeReport('student', 'error', new Error('Script error.'), env), null)
  assert.equal(makeReport('admin', 'error', new Error('あ'.repeat(900)), env)?.message.length, 500)
})

test('1回の起動で、同じエラーは1回・全体で上限まで', () => {
  const gate = new ReportGate(3)
  const r = (m: string) => makeReport('student', 'error', new Error(m), env)!
  assert.equal(gate.allow(r('a')), true)
  assert.equal(gate.allow(r('a')), false)
  assert.equal(gate.allow(r('b')), true)
  assert.equal(gate.allow(r('c')), true)
  assert.equal(gate.allow(r('d')), false)
})

const item = (o: Partial<ClientErrorItem> = {}): ClientErrorItem => ({
  id: 1, occurredAt: '2026-10-14T13:00:00Z', lastAt: '2026-10-14T13:41:00Z', repeats: 1, app: 'student', kind: 'handled',
  message: 'TypeError: x', stack: null, path: '/', device: 'iOS 18.1 · LINE 15.2.0', appVersion: 'abc1234',
  displayName: 'ノビ太', clubName: '［クラブ名］', ...o,
})
const NOW = Date.parse('2026-10-14T14:00:00Z')

test('運営の画面：見出しの一文', () => {
  assert.equal(stampOf('2026-10-14T13:41:00Z'), '10/14 22:41')
  assert.deepEqual(clientErrorNote([], NOW), { text: '画面のエラー：直近7日はありません。', warn: false })
  assert.deepEqual(clientErrorNote([item({ repeats: 3 }), item({ id: 2, lastAt: '2026-10-10T00:00:00Z' })], NOW),
    { text: '画面のエラー：直近24時間で 3回（7日で 4回、最新 10/14 22:41）', warn: true })
  assert.deepEqual(clientErrorNote([item({ lastAt: '2026-10-12T00:00:00Z' })], NOW),
    { text: '画面のエラー：直近24時間はありません（7日で 1回、最新 10/12 09:00）', warn: false })
})

test('運営の画面：1件の補足', () => {
  assert.equal(clientErrorMeta(item({ repeats: 2 })), '10/14 22:41 · 生徒の画面 · 画面で案内したエラー · ノビ太（［クラブ名］） · iOS 18.1 · LINE 15.2.0 · 版 abc1234 · 2回')
  assert.equal(clientErrorMeta(item({ app: 'admin', kind: 'render', displayName: null, clubName: null, device: null, appVersion: null })),
    '10/14 22:41 · 管理画面 · 画面の描画 · ログイン前')
})

test('種類がちがっても、同じ文面は1回だけ', () => {
  const gate = new ReportGate()
  assert.equal(gate.allow(makeReport('student', 'render', new Error('same'), env)!), true)
  assert.equal(gate.allow(makeReport('student', 'handled', new Error('same'), env)!), false)
})
