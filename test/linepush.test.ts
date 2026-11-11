import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alertErrorMessage, pushReasonText, pushResultNotice, pushStateOf, quotaNote, rowsByStudent } from '../src/admin/alertListModel.ts'
import type { AlertItem } from '../src/admin/alertListModel.ts'

const item = (o: Partial<AlertItem> = {}): AlertItem => ({
  id: 'a', studentId: 's', displayName: '［生徒］', grade: 8, kind: 'gap', detail: { missing_days: 4 }, occurredOn: '2026-11-10',
  status: 'open', contactedAt: null, resolvedAt: null, resumedAfterContact: null, template: null, completedAfterContact: null,
  friendStatus: 'friend', contactAllowed: true, sendMethod: 'manual', ...o,
})

test('pushStateOf: 再開の声かけで、LINE があり、ブロック・連絡停止でなければ送れる', () => {
  assert.equal(pushStateOf([item()]), 'ok')
  assert.equal(pushStateOf([item({ kind: 'streak_broken' })]), 'ok')
  assert.equal(pushStateOf([item({ friendStatus: 'unknown' })]), 'ok')
  assert.equal(pushStateOf([item({ kind: 'task_overdue' })]), 'not_kind')
  assert.equal(pushStateOf([item({ kind: 'badge_earned' })]), 'not_kind')
  assert.equal(pushStateOf([item({ friendStatus: null })]), 'no_line')
  assert.equal(pushStateOf([item({ friendStatus: 'blocked' })]), 'blocked')
  assert.equal(pushStateOf([item({ contactAllowed: false })]), 'contact_off')
})

test('rowsByStudent: 文面の元（優先のアラート）が再開の声かけなら送れる。LINE で送った連絡済みは取り消せない', () => {
  const [r] = rowsByStudent([item({ id: '1', kind: 'task_overdue' }), item({ id: '2', kind: 'gap' })])
  assert.equal(r.items[0].kind, 'gap')
  assert.equal(r.push, 'ok')
  assert.deepEqual(r.ids.sort(), ['1', '2'])
  const [c] = rowsByStudent([item({ status: 'contacted', contactedAt: '2026-11-11T01:00:00Z', sendMethod: 'line_api' })])
  assert.equal(c.sentByLine, true)
  const [m] = rowsByStudent([item({ status: 'contacted', contactedAt: '2026-11-11T01:00:00Z', sendMethod: 'manual' })])
  assert.equal(m.sentByLine, false)
})

test('quotaNote: 残り通数。少なくなったら注意', () => {
  assert.deepEqual(quotaNote({ limit: 200, used: 48, remaining: 152, sentByNobit: 12 }),
    { text: 'LINE で送れる今月の残り 152通（上限 200通・NOBIT! から 12通）', warn: false })
  assert.equal(quotaNote({ limit: 200, used: 195, remaining: 5, sentByNobit: 30 }).warn, true)
  assert.equal(quotaNote({ limit: null, used: 900, remaining: null, sentByNobit: 30 }).warn, false)
  assert.equal(quotaNote(null).warn, true)
})

test('pushResultNotice: 送れた人数と、送れなかった理由', () => {
  assert.deepEqual(pushResultNotice([{ alertIds: ['1'], ok: true }, { alertIds: ['2'], ok: true }]),
    { text: '2人に LINE で送り、連絡済みにしました。', failed: false })
  const n = pushResultNotice([{ alertIds: ['1'], ok: true }, { alertIds: ['2'], ok: false, reason: 'contact_off' }])
  assert.equal(n.failed, true)
  assert.match(n.text, /^1人に送りました。1人には送れませんでした。本人が連絡を止めている/)
  assert.match(pushResultNotice([{ alertIds: ['1'], ok: false, reason: 'quota' }]).text, /^送れませんでした。今月の残り/)
  assert.match(pushReasonText('not_push_kind'), /再開の声かけだけ/)
})

test('alertErrorMessage: 残り不足・LINE に届かないとき', () => {
  assert.match(alertErrorMessage(new Error('quota')), /1通も送っていません/)
  assert.match(alertErrorMessage(new Error('line_unavailable')), /送っていません/)
})
