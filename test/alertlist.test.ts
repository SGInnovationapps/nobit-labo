import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alertErrorMessage, copyText, groupAlerts, outcomeText, reasonText } from '../src/admin/alertListModel.ts'
import type { AlertItem } from '../src/admin/alertListModel.ts'

const item = (o: Partial<AlertItem> = {}): AlertItem => ({
  id: 'a', studentId: 's', displayName: 'ノビ太', grade: 8, kind: 'gap', detail: { missing_days: 4 }, occurredOn: '2026-10-10',
  status: 'open', contactedAt: null, resolvedAt: null, resumedAfterContact: null, template: null, completedAfterContact: null, ...o,
})

test('reasonText: 種類ごとに数字を入れた一文', () => {
  assert.equal(reasonText('gap', { missing_days: 4 }), '記録が4日空いています（休息日は数えません）')
  assert.equal(reasonText('streak_broken', { streak_days: 12 }), '12日続いた連続記録が途切れました')
  assert.equal(reasonText('not_started', { assigned: 2 }), '今日は配信タスク2件が未着手です')
  assert.equal(reasonText('task_overdue', { overdue: 1 }), '期限を過ぎた未完了の配信タスクが1件あります')
  assert.equal(reasonText('streak_milestone', { days: 30 }), '連続記録が30日に達しました')
  assert.equal(reasonText('badge_earned', { item: 'ガチャ初引き' }), 'バッジ「ガチャ初引き」を獲得しました')
})

test('copyText: 設定の文面を使い、なければ初期の文面。節目は日数を置き換える', () => {
  assert.equal(copyText('gap', '  また始めよう  ', {}), 'また始めよう')
  assert.ok(copyText('gap', null, {}).includes('短いタスク'))
  assert.equal(copyText('streak_milestone', '7日連続記録達成！おめでとう！', { days: 30 }), '30日連続記録達成！おめでとう！')
  assert.equal(copyText('streak_milestone', '7日連続記録達成！おめでとう！', { days: 7 }), '7日連続記録達成！おめでとう！')
})

test('groupAlerts: 対応待ちは古い順、連絡済みは連絡の新しい順、解消は新しい順', () => {
  const g = groupAlerts([
    item({ id: '1', occurredOn: '2026-10-10' }), item({ id: '2', occurredOn: '2026-10-08' }),
    item({ id: '3', status: 'contacted', contactedAt: '2026-10-09T01:00:00Z' }), item({ id: '4', status: 'contacted', contactedAt: '2026-10-10T01:00:00Z' }),
    item({ id: '5', status: 'resolved', resolvedAt: '2026-10-09T01:00:00Z' }), item({ id: '6', status: 'resolved', resolvedAt: '2026-10-10T01:00:00Z' }),
  ])
  assert.deepEqual(g.open.map((i) => i.id), ['2', '1'])
  assert.deepEqual(g.contacted.map((i) => i.id), ['4', '3'])
  assert.deepEqual(g.resolved.map((i) => i.id), ['6', '5'])
})

test('outcomeText・alertErrorMessage', () => {
  assert.equal(outcomeText(item()), null)
  assert.equal(outcomeText(item({ status: 'contacted', completedAfterContact: 2 })), '連絡後の完了タスク 2 件')
  assert.ok(outcomeText(item({ status: 'resolved', resumedAfterContact: true, completedAfterContact: 3 }))?.includes('再開'))
  assert.equal(outcomeText(item({ status: 'resolved', resumedAfterContact: false })), null)
  assert.ok(alertErrorMessage(new Error('not_open')).includes('対応済み'))
  assert.ok(alertErrorMessage({ message: 'forbidden' }).includes('運営'))
})

import { historyOutcome, isSettled, summarizeHistory } from '../src/admin/alertListModel.ts'

test('summarizeHistory: 種類ごとの連絡数・再開・連絡後の完了。連絡していないものは数えない', () => {
  const h = [
    item({ id: '1', kind: 'gap', status: 'resolved', contactedAt: '2026-10-01T01:00:00Z', resumedAfterContact: true, completedAfterContact: 3 }),
    item({ id: '2', kind: 'gap', status: 'contacted', contactedAt: '2026-10-09T01:00:00Z', completedAfterContact: 0 }),
    item({ id: '3', kind: 'streak_broken', status: 'resolved', contactedAt: '2026-10-02T01:00:00Z', resumedAfterContact: true, completedAfterContact: 1 }),
    item({ id: '4', kind: 'gap', status: 'open' }),
  ]
  const s = summarizeHistory(h, ['not_started', 'gap', 'streak_broken'])
  assert.deepEqual(s.map((x) => x.kind), ['gap', 'streak_broken'])
  assert.deepEqual(s[0], { kind: 'gap', contacted: 2, resumed: 1, completedAny: 1, completedTotal: 3 })
  assert.deepEqual(s[1], { kind: 'streak_broken', contacted: 1, resumed: 1, completedAny: 1, completedTotal: 1 })
})

test('isSettled・historyOutcome', () => {
  const now = Date.parse('2026-10-10T00:00:00Z')
  assert.equal(isSettled('2026-10-02T00:00:00Z', now), true)
  assert.equal(isSettled('2026-10-05T00:00:00Z', now), false)
  assert.equal(historyOutcome(item({ status: 'resolved', resumedAfterContact: true, completedAfterContact: 2 })), '学習を再開・連絡後の完了 2 件')
  assert.equal(historyOutcome(item({ status: 'contacted', completedAfterContact: 0 })), '再開待ち・連絡後の完了 0 件')
})

import { copyText as copyT, reasonText as reasonT, CLUB_MISSION_END_TEXT } from '../src/admin/alertListModel.ts'
test('club_mission: 開始と終了前日で文言が変わる', () => {
  assert.equal(reasonT('club_mission', { title: 'A', phase: 'start' }), 'クラブミッション「A」が始まりました')
  assert.match(reasonT('club_mission', { title: 'A', phase: 'end' }), /明日が最終日/)
  assert.equal(copyT('club_mission', null, { phase: 'end' }), CLUB_MISSION_END_TEXT)
  assert.equal(copyT('club_mission', null, { phase: 'start' }), '新しいクラブミッションが始まったよ！')
  assert.equal(copyT('club_mission', '独自の文面', { phase: 'end' }), '独自の文面')
})

import { lastRunNote } from '../src/admin/alertListModel.ts'
test('lastRunNote: 動いている・止まっている・失敗・記録なし', () => {
  const now = Date.parse('2026-10-10T14:20:00Z')
  const ok = lastRunNote({ ranAt: '2026-10-10T14:05:00Z', ok: true }, now)
  assert.equal(ok.warn, false)
  assert.match(ok.text, /最後の実行 23:05/)
  assert.equal(lastRunNote({ ranAt: '2026-10-10T09:00:00Z', ok: true }, now).warn, true)
  assert.match(lastRunNote({ ranAt: '2026-10-10T14:05:00Z', ok: false }, now).text, /失敗/)
  assert.equal(lastRunNote(null, now).warn, true)
})
