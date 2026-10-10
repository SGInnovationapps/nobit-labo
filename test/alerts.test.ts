import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALERT_DEFS, conditionText, isDirty, ruleProblem, saveErrorMessage, sortRules } from '../src/admin/alertsModel.ts'
import type { AlertRule } from '../src/admin/alertsModel.ts'

const rule = (o: Partial<AlertRule> = {}): AlertRule => ({ kind: 'gap', enabled: true, thresholdDays: 3, sendMethod: 'manual', template: '文面', ...o })

test('ALERT_DEFS: 仕様書の7種類で、［仮］は途切れと期限超過', () => {
  assert.equal(ALERT_DEFS.length, 7)
  assert.deepEqual(ALERT_DEFS.filter((d) => d.provisional).map((d) => d.kind), ['streak_broken', 'task_overdue'])
})

test('sortRules: 表の順に並べ直す', () => {
  const r = sortRules([rule({ kind: 'club_mission', thresholdDays: null }), rule({ kind: 'not_started', thresholdDays: null }), rule()])
  assert.deepEqual(r.map((x) => x.kind), ['not_started', 'gap', 'club_mission'])
})

test('ruleProblem: 日数は1〜30、文面は1〜200文字', () => {
  assert.equal(ruleProblem(rule()), null)
  assert.ok(ruleProblem(rule({ thresholdDays: 0 })))
  assert.ok(ruleProblem(rule({ thresholdDays: 31 })))
  assert.ok(ruleProblem(rule({ thresholdDays: null })))
  assert.ok(ruleProblem(rule({ thresholdDays: 2.5 })))
  assert.ok(ruleProblem(rule({ template: '   ' })))
  assert.ok(ruleProblem(rule({ template: 'あ'.repeat(201) })))
  assert.equal(ruleProblem(rule({ kind: 'badge_earned', thresholdDays: null })), null)
})

test('isDirty・conditionText・saveErrorMessage', () => {
  assert.equal(isDirty(rule(), rule({ template: '  文面  ' })), false)
  assert.equal(isDirty(rule(), rule({ enabled: false })), true)
  assert.equal(isDirty(rule(), rule({ thresholdDays: 5 })), true)
  assert.ok(conditionText(rule({ thresholdDays: 5 })).includes('5日'))
  assert.ok(conditionText(rule({ kind: 'streak_milestone', thresholdDays: null })).includes('7・30・100'))
  assert.ok(saveErrorMessage(new Error('invalid_threshold')).includes('1〜30'))
  assert.ok(saveErrorMessage({ message: 'forbidden' }).includes('運営'))
  assert.ok(saveErrorMessage(null).includes('通信'))
})
