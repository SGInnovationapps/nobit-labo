import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWeek, recordsOpenFor, taskBadge, visibleRecords, weekLevelOf, weekStudyDays, weekSummary } from '../src/home/homeModel.ts'
import type { HomeTask } from '../src/home/homeModel.ts'

const t = (id: string, done: boolean, isFree = false): HomeTask => ({
  id, title: id, subject: '英語', estimatedMinutes: null, isFree, completedAt: done ? '2026-10-11T08:05:00Z' : null,
})

test('この7日間：棒の高さは 1 / 2 / 3 / 4件以上の4段階、0 は棒なし', () => {
  assert.equal(weekLevelOf(0), null)
  assert.deepEqual([1, 2, 3, 4, 9].map(weekLevelOf), [1, 2, 3, 4, 4])
})

test('この7日間：今日が右端、曜日つき、休息日と記録なし', () => {
  const cells = buildWeek(
    [{ date: '2026-10-05', count: 2 }, { date: '2026-10-08', count: 5 }, { date: '2026-10-11', count: 1 }],
    '2026-10-11',
    ['2026-10-10', '2026-10-08'],
  )
  assert.equal(cells.length, 7)
  assert.deepEqual(cells.map((c) => c.weekday), ['月', '火', '水', '木', '金', '土', '今日'])
  assert.equal(cells[6].today, true)
  assert.equal(cells.filter((c) => c.today).length, 1)
  assert.equal(cells[0].kind === 'done' && cells[0].level, 2)
  // 記録がある日は、休息日に登録されていても記録として見せる
  assert.equal(cells[3].kind === 'done' && cells[3].level, 4)
  assert.equal(cells[5].kind, 'rest')
  assert.equal(cells[1].kind, 'none')
  assert.equal(weekStudyDays(cells), 3)
  assert.equal(weekSummary(cells), 'この7日間の記録の数。月2件、火なし、水なし、木5件、金なし、土休息日、今日1件')
})

test('今日の記録：2件だけ出し、残りはトグルで開く', () => {
  assert.deepEqual(visibleRecords(['a', 'b', 'c', 'd'], false), { shown: ['a', 'b'], hidden: 2 })
  assert.deepEqual(visibleRecords(['a', 'b', 'c', 'd'], true), { shown: ['a', 'b', 'c', 'd'], hidden: 0 })
  assert.deepEqual(visibleRecords(['a', 'b'], false), { shown: ['a', 'b'], hidden: 0 })
  assert.deepEqual(visibleRecords([], false), { shown: [], hidden: 0 })
})

test('今日の記録の開閉は、その日のあいだだけ覚えておく', () => {
  assert.equal(recordsOpenFor('2026-10-11', '2026-10-11'), true)
  assert.equal(recordsOpenFor('2026-10-10', '2026-10-11'), false)
  assert.equal(recordsOpenFor(null, '2026-10-11'), false)
})

test('「タスクを見る」の右上：残りの数、すべて完了なら「完了」、タスクがなければ出さない', () => {
  assert.equal(taskBadge([]), null)
  assert.deepEqual(taskBadge([t('a', false), t('b', true), t('c', false, true)]), { kind: 'left', text: '残り2' })
  assert.deepEqual(taskBadge([t('a', true), t('b', true)]), { kind: 'done', text: '完了' })
})
