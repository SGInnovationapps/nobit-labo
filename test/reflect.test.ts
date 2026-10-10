import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarCells, minutesLabel, periodOf, shiftAnchor, summarize, weekdayIndex } from '../src/home/reflectModel.ts'

test('weekdayIndex: 月曜 0・日曜 6', () => {
  assert.equal(weekdayIndex('2026-10-05'), 0)
  assert.equal(weekdayIndex('2026-10-11'), 6)
})

test('periodOf: 月と週（月〜日）', () => {
  const m = periodOf('month', '2026-10-10')
  assert.deepEqual([m.from, m.to, m.label], ['2026-10-01', '2026-10-31', '2026年10月'])
  const w = periodOf('week', '2026-10-10')
  assert.deepEqual([w.from, w.to, w.label], ['2026-10-05', '2026-10-11', '10月5日〜10月11日'])
  assert.equal(periodOf('month', '2028-02-15').to, '2028-02-29')
})

test('shiftAnchor: 月・週の移動（年またぎ）', () => {
  assert.equal(shiftAnchor('month', '2026-01-20', -1), '2025-12-01')
  assert.equal(shiftAnchor('month', '2026-12-05', 1), '2027-01-01')
  assert.equal(shiftAnchor('week', '2026-10-10', -1), '2026-10-03')
})

test('calendarCells: 月初の前に空き、記録の段階、今日、未来', () => {
  const p = periodOf('month', '2026-10-10')
  const cells = calendarCells(p, [{ date: '2026-10-02', count: 1 }, { date: '2026-10-09', count: 3 }], '2026-10-10', ['2026-10-06'])
  assert.equal(cells.length, 3 + 31) // 10/1 は木曜なので、月〜水の 3 つが空き
  assert.equal(cells[0], null)
  const at = (d: string) => cells.find((c) => c?.date === d)!
  assert.equal(at('2026-10-02').kind, 'done')
  assert.equal((at('2026-10-09') as { level: number }).level, 3)
  assert.equal(at('2026-10-06').kind, 'rest')
  assert.equal(at('2026-10-03').kind, 'none')
  assert.equal(at('2026-10-10').today, true)
  assert.equal(at('2026-10-11').kind, 'future')
})

test('calendarCells: 週は 7 つで空きなし', () => {
  const cells = calendarCells(periodOf('week', '2026-10-10'), [], '2026-10-10')
  assert.equal(cells.length, 7)
  assert.equal(cells.every((c) => c !== null), true)
})

test('summarize: 学習日・完了タスク・タイマー時間・教科別', () => {
  const s = summarize(
    [{ date: '2026-10-01', count: 2 }, { date: '2026-10-02', count: 0 }, { date: '2026-10-03', count: 1 }],
    [{ subject: '英語' }, { subject: '英語' }, { subject: '体育' }],
    [
      { subject: '数学', kind: 'tag', durationSeconds: null },
      { subject: '数学', kind: 'timer', durationSeconds: 900 },
      { subject: '英語', kind: 'timer', durationSeconds: 1830 },
    ],
  )
  assert.equal(s.studyDays, 2)
  assert.equal(s.completedTasks, 3)
  assert.equal(s.timerMinutes, 45)
  assert.deepEqual(s.subjects.map((r) => [r.subject, r.tasks, r.records, r.minutes]), [
    ['英語', 2, 1, 30], ['数学', 0, 2, 15], ['その他', 1, 0, 0],
  ])
})

test('minutesLabel', () => {
  assert.equal(minutesLabel(45), '45分')
  assert.equal(minutesLabel(60), '1時間')
  assert.equal(minutesLabel(95), '1時間35分')
})
