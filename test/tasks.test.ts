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

import { ASSIGNED_TASK_COINS, draftFromTask, eligibleStudents, gradesLabel, toggleGrade } from '../src/admin/taskModel.ts'

test('draftFromTask: 複製は開始日を今日にし、期限日を空にして、ほかを引き継ぐ', () => {
  const src = t({ id: 'x', title: '方程式の文章題', subject: '数学', startsOn: '2026-09-01', dueOn: '2026-09-30', recurrence: 'weekly', estimatedMinutes: 20, targetGrades: [8, 7], rewardCoins: 15 })
  const d = draftFromTask(src, '2026-10-09', ['c1'])
  assert.deepEqual(
    { ...d },
    { title: '方程式の文章題', subject: '数学', startsOn: '2026-10-09', dueOn: '', recurrence: 'weekly', minutes: '20', clubIds: ['c1'], grades: [7, 8], coins: '15' },
  )
  assert.equal(hasErrors(validateDraft(d, '2026-10-09')), false)
  const none = draftFromTask(t({ id: 'y', title: 'a', estimatedMinutes: null }), '2026-10-09', [])
  assert.equal(none.minutes, '')
  assert.equal(none.coins, String(ASSIGNED_TASK_COINS))
  assert.deepEqual(none.grades, [])
})

test('toggleGrade・gradesLabel: 学年の選びなおしと表示', () => {
  assert.deepEqual(toggleGrade([], 9), [9])
  assert.deepEqual(toggleGrade([9], 7), [7, 9])
  assert.deepEqual(toggleGrade([7, 9], 7), [9])
  assert.equal(gradesLabel(null), '全学年')
  assert.equal(gradesLabel([]), '全学年')
  assert.equal(gradesLabel([7, 8, 9, 10, 11, 12]), '全学年')
  assert.equal(gradesLabel([8, 7]), '中1・中2')
  assert.equal(gradesLabel([10, 11]), '高1・高2')
})

test('eligibleStudents: 今日の完了率の分母は、学年の対象に入る生徒', () => {
  const grades = [7, 7, 8, 9, 10, null]
  assert.equal(eligibleStudents({ targetGrades: null }, grades), 6)
  assert.equal(eligibleStudents({ targetGrades: [7, 8] }, grades), 3)
  assert.equal(eligibleStudents({ targetGrades: [12] }, grades), 0)
})

test('validateDraft: クラブの選択と報酬のコイン', () => {
  const ok = { ...emptyDraft('2026-10-09', ['c1']), title: 'a', subject: '英語' }
  assert.equal(validateDraft({ ...ok, clubIds: [] }, '2026-10-09', true).clubs !== undefined, true)
  assert.equal(validateDraft({ ...ok, clubIds: [] }, '2026-10-09', false).clubs, undefined)
  assert.equal(validateDraft(ok, '2026-10-09', true).clubs, undefined)
  assert.ok(validateDraft({ ...ok, coins: '-1' }, '2026-10-09').coins)
  assert.ok(validateDraft({ ...ok, coins: '101' }, '2026-10-09').coins)
  assert.ok(validateDraft({ ...ok, coins: '1.5' }, '2026-10-09').coins)
  assert.equal(validateDraft({ ...ok, coins: '0' }, '2026-10-09').coins, undefined)
  assert.equal(validateDraft({ ...ok, coins: '' }, '2026-10-09').coins, undefined)
})
