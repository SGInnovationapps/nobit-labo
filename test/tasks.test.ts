import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  completionLabel, dueToday, emptyDraft, groupTasks, hasErrors, periodLabel, recurrenceLabel, taskStatus, validateDraft,
} from '../src/admin/taskModel.ts'
import type { AdminTask } from '../src/admin/taskModel.ts'

const today = '2026-10-09' // 金曜日
const t = (o: Partial<AdminTask>): AdminTask => ({
  id: 'x', clubId: 'c', title: 't', subject: '英語', startsOn: today, dueOn: null, recurrence: 'daily',
  estimatedMinutes: null, archivedAt: null, ...o,
})

test('状態：配信中・予定・終了', () => {
  assert.equal(taskStatus(t({}), today), 'active')
  assert.equal(taskStatus(t({ startsOn: '2026-10-10' }), today), 'scheduled')
  assert.equal(taskStatus(t({ dueOn: '2026-10-08' }), today), 'ended')
  assert.equal(taskStatus(t({ dueOn: today }), today), 'active')
  assert.equal(taskStatus(t({ archivedAt: '2026-10-01T00:00:00Z' }), today), 'ended')
  assert.equal(taskStatus(t({ recurrence: 'none', startsOn: '2026-10-08' }), today), 'ended')
  assert.equal(taskStatus(t({ recurrence: 'none', startsOn: today }), today), 'active')
  assert.equal(taskStatus(t({ recurrence: 'none', startsOn: '2026-10-08', dueOn: '2026-10-12' }), today), 'active')
})

test('今日の分として出る日（DB の規則と同じ）', () => {
  assert.equal(dueToday(t({ recurrence: 'weekdays' }), today), true) // 金
  assert.equal(dueToday(t({ recurrence: 'weekdays' }), '2026-10-10'), false) // 土
  assert.equal(dueToday(t({ recurrence: 'weekly', startsOn: '2026-10-02' }), today), true) // 同じ金曜
  assert.equal(dueToday(t({ recurrence: 'weekly', startsOn: '2026-10-01' }), today), false)
  assert.equal(dueToday(t({ startsOn: '2026-10-10' }), today), false) // 予定
})

test('表示の文言', () => {
  assert.equal(periodLabel(t({ dueOn: '2026-10-31' })), '10月9日〜10月31日')
  assert.equal(periodLabel(t({})), '10月9日から')
  assert.equal(periodLabel(t({ recurrence: 'none' })), '10月9日のみ')
  assert.equal(recurrenceLabel(t({ recurrence: 'weekly' })), '毎週金曜日')
  assert.equal(completionLabel(3, 12, true), '3 / 12 人')
  assert.equal(completionLabel(0, 0, true), '承認済みの生徒がいません')
  assert.equal(completionLabel(0, 12, false), '今日は配信なし')
})

test('作成フォームの検査', () => {
  const ok = { ...emptyDraft(today), title: '英単語 Unit 3', subject: '英語' }
  assert.equal(hasErrors(validateDraft(ok, today)), false)
  assert.ok(validateDraft({ ...ok, title: '  ' }, today).title)
  assert.ok(validateDraft({ ...ok, title: 'あ'.repeat(61) }, today).title)
  assert.ok(validateDraft({ ...ok, subject: '' }, today).subject)
  assert.ok(validateDraft({ ...ok, startsOn: '2026-10-08' }, today).startsOn)
  assert.ok(validateDraft({ ...ok, dueOn: '2026-10-08' }, today).dueOn)
  assert.equal(validateDraft({ ...ok, dueOn: today }, today).dueOn, undefined)
  assert.ok(validateDraft({ ...ok, minutes: '0' }, today).minutes)
  assert.ok(validateDraft({ ...ok, minutes: '1.5' }, today).minutes)
  assert.equal(validateDraft({ ...ok, minutes: '15' }, today).minutes, undefined)
})

test('並び', () => {
  const g = groupTasks([
    t({ id: 'a', startsOn: '2026-10-01' }), t({ id: 'b', startsOn: '2026-10-05' }),
    t({ id: 'c', startsOn: '2026-10-20' }), t({ id: 'd', startsOn: '2026-10-12' }),
    t({ id: 'e', dueOn: '2026-10-03', startsOn: '2026-10-01' }), t({ id: 'f', dueOn: '2026-10-07', startsOn: '2026-10-01' }),
  ], today)
  assert.deepEqual(g.active.map((x) => x.id), ['b', 'a'])
  assert.deepEqual(g.scheduled.map((x) => x.id), ['d', 'c'])
  assert.deepEqual(g.ended.map((x) => x.id), ['f', 'e'])
})
