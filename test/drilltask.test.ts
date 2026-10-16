import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canDrill, draftFromTask, drillFields, DRILL_TASK_TOTAL, DRILL_TASK_TOTAL_MAX, emptyDraft, validateDraft,
} from '../src/admin/taskModel.ts'
import type { AdminTask, Draft } from '../src/admin/taskModel.ts'
import { drillLastLabel } from '../src/admin/studentModel.ts'

const TODAY = '2026-10-16'
const base = (over: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(TODAY, ['c1']),
  title: '理科のドリル',
  subject: '理科',
  ...over,
})

test('canDrill: 問題バンクがあるのは英語・理科・社会だけ', () => {
  assert.equal(canDrill('理科'), true)
  assert.equal(canDrill('英語'), true)
  assert.equal(canDrill('社会'), true)
  assert.equal(canDrill('数学'), false)
  assert.equal(canDrill('国語'), false)
  assert.equal(canDrill(''), false)
})

test('emptyDraft: はじめはドリルではない', () => {
  const d = emptyDraft(TODAY)
  assert.equal(d.isDrill, false)
  assert.equal(d.drillCategory, '')
  assert.equal(d.drillTotal, String(DRILL_TASK_TOTAL))
})

test('drillFields: ドリルのときだけ、保存する値を返す', () => {
  assert.equal(drillFields(base()), null)
  assert.deepEqual(drillFields(base({ isDrill: true })), {
    drill_subject: '理科', drill_category: null, drill_total: 10,
  })
  assert.deepEqual(drillFields(base({ isDrill: true, drillCategory: ' 気体の性質 ', drillTotal: '5' })), {
    drill_subject: '理科', drill_category: '気体の性質', drill_total: 5,
  })
})

test('drillFields: ドリルを出せない教科では、ドリルにしない', () => {
  assert.equal(drillFields(base({ subject: '数学', isDrill: true })), null)
})

test('validateDraft: ドリルの問題数と教科を確かめる', () => {
  assert.equal(validateDraft(base({ isDrill: true }), TODAY).drill, undefined)
  assert.match(validateDraft(base({ subject: '国語', isDrill: true }), TODAY).drill ?? '', /英語・理科・社会/)
  assert.match(validateDraft(base({ isDrill: true, drillTotal: '0' }), TODAY).drill ?? '', /1〜/)
  assert.match(validateDraft(base({ isDrill: true, drillTotal: String(DRILL_TASK_TOTAL_MAX + 1) }), TODAY).drill ?? '', /1〜/)
  assert.match(validateDraft(base({ isDrill: true, drillTotal: '1.5' }), TODAY).drill ?? '', /整数/)
  // ドリルでなければ、問題数が変でも通す
  assert.equal(validateDraft(base({ drillTotal: '0' }), TODAY).drill, undefined)
})

test('draftFromTask: 複製でドリルの指定も引き継ぐ', () => {
  const t: AdminTask = {
    id: 't1', clubId: 'c1', title: '理科 ドリル', subject: '理科', startsOn: '2026-10-01', dueOn: null,
    recurrence: 'daily', estimatedMinutes: null, archivedAt: null,
    drill: { subject: '理科', category: '気体の性質', total: 5 },
  }
  const d = draftFromTask(t, TODAY, ['c1'])
  assert.equal(d.isDrill, true)
  assert.equal(d.drillCategory, '気体の性質')
  assert.equal(d.drillTotal, '5')

  const plain = draftFromTask({ ...t, drill: null }, TODAY, ['c1'])
  assert.equal(plain.isDrill, false)
  assert.equal(plain.drillCategory, '')
})

test('drillLastLabel: JST の日付で出す。まだなら「なし」', () => {
  assert.equal(drillLastLabel(null), 'なし')
  assert.equal(drillLastLabel(''), 'なし')
  assert.equal(drillLastLabel('こわれた日付'), 'なし')
  assert.equal(drillLastLabel('2026-10-16T02:30:00Z'), '2026/10/16')
  // UTC では前日でも、JST では翌日
  assert.equal(drillLastLabel('2026-10-15T16:00:00Z'), '2026/10/16')
})
