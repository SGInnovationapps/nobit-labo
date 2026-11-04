import assert from 'node:assert/strict'
import { test } from 'node:test'
import { subjectGridCopy, tasksLeftLabel } from '../src/home/homeModel.ts'
import type { HomeTask } from '../src/home/homeModel.ts'

const t = (id: string, done: boolean): HomeTask => ({
  id, subject: '英語', title: id, estimatedMinutes: null, isFree: false, completedAt: done ? '2026-11-04T09:00:00Z' : null, drill: null,
})

test('subjectGridCopy: まだ記録していない日は「何を押すか」、記録したあとは「ほかにも押せる」', () => {
  assert.equal(subjectGridCopy('notyet').title, '勉強した教科を、タップ')
  assert.match(subjectGridCopy('notyet').sub, /1タップで、今日の記録/)
  assert.match(subjectGridCopy('first').sub, /1日目/)
  assert.equal(subjectGridCopy('resume').title, '勉強した教科を、タップ')
  assert.equal(subjectGridCopy('recording').title, 'ほかにも勉強したら、タップ')
  assert.equal(subjectGridCopy('done').title, 'ほかにも勉強したら、タップ')
})

test('tasksLeftLabel: 課題がない日は null、残りの数とすべて完了', () => {
  assert.equal(tasksLeftLabel([]), null)
  assert.deepEqual(tasksLeftLabel([t('a', false), t('b', true)]), { left: 1, allDone: false })
  assert.deepEqual(tasksLeftLabel([t('a', true), t('b', true)]), { left: 0, allDone: true })
})
