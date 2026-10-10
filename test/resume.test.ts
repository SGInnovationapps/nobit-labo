import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsResume, shortFirst } from '../src/home/homeModel.ts'
import type { HomeTask } from '../src/home/homeModel.ts'

const t = (id: string, min: number | null, done = false): HomeTask => ({ id, title: id, subject: '英語', estimatedMinutes: min, isFree: false, completedAt: done ? '2026-10-09T01:00:00Z' : null })

test('needsResume: 途切れていて、その途切れをまだ見ていないとき', () => {
  assert.equal(needsResume(0, '2026-10-01', null), true)
  assert.equal(needsResume(0, '2026-10-01', '2026-10-01'), false)
  assert.equal(needsResume(0, '2026-10-01', '2026-09-10'), true)
  assert.equal(needsResume(3, '2026-10-08', null), false)
  assert.equal(needsResume(0, null, null), false)
})

test('shortFirst: 未完了だけ、見込み時間の短い順、見込みなしは後ろ、最大3件', () => {
  const r = shortFirst([t('a', 15), t('b', null), t('c', 5, true), t('d', 10), t('e', 20), t('f', 8)])
  assert.deepEqual(r.map((x) => x.id), ['f', 'd', 'a'])
  assert.deepEqual(shortFirst([t('x', null), t('y', null)]).map((x) => x.id), ['x', 'y'])
})
