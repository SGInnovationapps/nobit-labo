import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addDays, bandSummary, buildBand, cheerOf, dateLabel, dayState, jstDate, levelOf, sortTasks, timeLabel,
} from '../src/home/homeModel.ts'
import type { HomeTask } from '../src/home/homeModel.ts'

const t = (id: string, completedAt: string | null, isFree = false): HomeTask => ({
  id, title: id, subject: '英語', estimatedMinutes: null, isFree, completedAt,
})

test('JST の日付と時刻', () => {
  assert.equal(jstDate('2026-10-08T15:30:00Z'), '2026-10-09')
  assert.equal(jstDate('2026-10-08T14:59:59Z'), '2026-10-08')
  assert.equal(timeLabel('2026-10-09T08:05:00Z'), '17:05')
  assert.equal(timeLabel('2026-10-08T15:00:00Z'), '00:00')
})

test('日付の加減（月またぎ）', () => {
  assert.equal(addDays('2026-10-01', -1), '2026-09-30')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})

test('棒の段階は 1 / 2 / 3 件以上、0 は空白', () => {
  assert.equal(levelOf(0), null)
  assert.deepEqual([1, 2, 3, 9].map(levelOf), [1, 2, 3, 3])
})

test('記録の帯：30 日・右端が今日・空白と休息日', () => {
  const cells = buildBand([{ date: '2026-10-09', count: 2 }, { date: '2026-10-07', count: 5 }], '2026-10-09', 30, ['2026-10-08'])
  assert.equal(cells.length, 30)
  const last = cells[29]
  assert.equal(last.date, '2026-10-09')
  assert.equal(last.today, true)
  assert.equal(last.kind === 'done' && last.level, 2)
  assert.equal(cells[28].kind, 'rest')
  assert.equal(cells[27].kind === 'done' && cells[27].level, 3)
  assert.equal(cells[0].kind, 'none')
  assert.equal(cells.filter((c) => c.today).length, 1)
  assert.equal(bandSummary(cells), '直近30日のうち、記録した日は2日')
})

test('並び：未完了が上、完了は完了順', () => {
  const s = sortTasks([t('c2', '2026-10-09T09:00:00Z'), t('free', null, true), t('a', null), t('c1', '2026-10-09T08:00:00Z')])
  assert.deepEqual(s.map((x) => x.id), ['a', 'free', 'c1', 'c2'])
})

test('今日の状態と一文', () => {
  assert.equal(dayState([]), 'empty')
  assert.equal(dayState([t('a', null)]), 'none')
  assert.equal(dayState([t('a', null), t('b', 'x')]), 'partial')
  assert.equal(dayState([t('b', 'x')]), 'all')
  assert.equal(cheerOf([t('a', null), t('b', null), t('c', 'x')]), 'あと2件。できるところから。')
  assert.equal(cheerOf([t('a', null)]), '今日も、ひとつ育てよう。')
})

test('日付の表示', () => {
  assert.equal(dateLabel('2026-10-09'), '10月9日（金）')
})
