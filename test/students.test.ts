import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  attentionOf, buildScaledBand, commentError, countStates, dayState, filterStudents, gapDays, lastStudyLabel,
  monthDays, sortByAttention, stateOf, subjectBreakdown, weeklyDays,
} from '../src/admin/studentModel.ts'
import type { StudentRow } from '../src/admin/studentModel.ts'

const today = '2026-10-09' // 金曜日
const S = (o: Partial<StudentRow>): StudentRow => ({
  userId: 'u', displayName: 'a', grade: 8, assignedTotal: 2, assignedDone: 0, activityToday: 0,
  currentDays: 0, longestDays: 0, lastAchievedDate: today, activity: [], ...o,
})

test('今日の状態', () => {
  assert.equal(dayState(2, 2, 2), 'all')
  assert.equal(dayState(2, 1, 1), 'partial')
  assert.equal(dayState(2, 0, 0), 'none')
  assert.equal(dayState(2, 0, 1), 'partial') // 自由登録だけ完了した
  assert.equal(dayState(0, 0, 0), 'none')
  assert.equal(dayState(0, 0, 1), 'all') // 配信がなく、自分で記録した
})

test('空いた日数と最終学習の表示', () => {
  assert.equal(gapDays('2026-10-06', today), 3)
  assert.equal(gapDays(null, today), null)
  assert.equal(lastStudyLabel(today, today), '今日')
  assert.equal(lastStudyLabel('2026-10-08', today), '昨日')
  assert.equal(lastStudyLabel('2026-10-01', today), '8日前')
  assert.equal(lastStudyLabel(null, today), '記録なし')
})

test('対応が必要な順', () => {
  assert.deepEqual(attentionOf(S({ lastAchievedDate: '2026-10-06' }), today), { rank: 0, reason: '記録が3日空いています' })
  assert.equal(attentionOf(S({ lastAchievedDate: '2026-10-07' }), today).rank, 1) // 2日空き・未着手
  assert.deepEqual(attentionOf(S({ lastAchievedDate: null }), today), { rank: 0, reason: 'まだ記録がありません' })
  assert.equal(attentionOf(S({ assignedDone: 2, activityToday: 2 }), today).rank, 3)
  assert.equal(attentionOf(S({ assignedDone: 1, activityToday: 1 }), today).rank, 2)
  // 今日すべて完了なら、直近の空きは対応不要
  assert.equal(attentionOf(S({ lastAchievedDate: today, assignedDone: 2, activityToday: 2 }), today).rank, 3)
})

test('並び：空きが長い順 → 未着手 → 一部完了 → すべて完了', () => {
  const list = [
    S({ userId: 'done', displayName: 'あ', assignedDone: 2, activityToday: 2 }),
    S({ userId: 'part', displayName: 'い', assignedDone: 1, activityToday: 1 }),
    S({ userId: 'none', displayName: 'う', lastAchievedDate: '2026-10-08' }),
    S({ userId: 'gap4', displayName: 'え', lastAchievedDate: '2026-10-05' }),
    S({ userId: 'gap3', displayName: 'お', lastAchievedDate: '2026-10-06' }),
    S({ userId: 'never', displayName: 'か', lastAchievedDate: null }),
  ]
  assert.deepEqual(sortByAttention(list, today).map((s) => s.userId), ['never', 'gap4', 'gap3', 'none', 'part', 'done'])
})

test('絞り込みと人数', () => {
  const list = [S({ displayName: 'ノビ太', assignedDone: 2, activityToday: 2 }), S({ displayName: 'しずか', assignedDone: 1, activityToday: 1 }), S({ displayName: 'スネ夫' })]
  assert.deepEqual(countStates(list), { all: 1, partial: 1, none: 1 })
  assert.equal(filterStudents(list, 'any', '').length, 3)
  assert.deepEqual(filterStudents(list, 'partial', '').map((s) => s.displayName), ['しずか'])
  assert.deepEqual(filterStudents(list, 'any', ' スネ ').map((s) => s.displayName), ['スネ夫'])
  assert.equal(stateOf(list[0]), 'all')
})

test('クラブ全体の帯：最大に対する割合で3段階', () => {
  const cells = buildScaledBand([{ date: today, count: 12 }, { date: '2026-10-08', count: 6 }, { date: '2026-10-07', count: 2 }], today, 14)
  assert.equal(cells.length, 14)
  assert.equal(cells[13].kind === 'done' && cells[13].level, 3)
  assert.equal(cells[12].kind === 'done' && cells[12].level, 2)
  assert.equal(cells[11].kind === 'done' && cells[11].level, 1)
  assert.equal(cells[0].kind, 'none')
  assert.equal(buildScaledBand([], today, 14).every((c) => c.kind === 'none'), true)
})

test('12週：月曜はじまり、最後が今週', () => {
  const w = weeklyDays(['2026-10-05', '2026-10-06', '2026-10-09', '2026-10-04', '2026-07-20', '2026-07-19'], today, 12)
  assert.equal(w.length, 12)
  assert.equal(w[11].start, '2026-10-05')
  assert.equal(w[11].days, 3) // 月・火・金
  assert.equal(w[11].level, 2)
  assert.equal(w[10].start, '2026-09-28')
  assert.equal(w[10].days, 1) // 日曜 10/4 は前の週
  assert.equal(w[0].start, '2026-07-20')
  assert.equal(w[0].days, 1) // 7/19 は範囲外
})

test('月の学習日と教科別', () => {
  assert.equal(monthDays(['2026-10-01', '2026-10-01', '2026-10-09', '2026-09-30'], today), 2)
  const b = subjectBreakdown(['英語', '数学', '英語', '英語', '国語', '数学'])
  assert.deepEqual(b.map((x) => [x.subject, x.count]), [['英語', 3], ['数学', 2], ['国語', 1]])
  assert.equal(b[0].ratio, 1)
  assert.deepEqual(subjectBreakdown([]), [])
})

test('応援コメントの検査', () => {
  assert.ok(commentError('   '))
  assert.equal(commentError('よく続けているね'), null)
  assert.ok(commentError('あ'.repeat(301)))
  assert.equal(commentError('あ'.repeat(300)), null)
})
