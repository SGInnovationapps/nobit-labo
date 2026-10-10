import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addDays, bandSummary, buildBand, cheerOf, coinNote, dateLabel, dayState, elapsedLabel, elapsedMinutes, focusNote, focusProgress, jstDate, levelOf,
  monthStudyDays, sortTasks, timeLabel, validateContent, validateMinutes,
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

test('今月の学習日数：月をまたがず、記録のある日だけ数える', () => {
  const a = [
    { date: '2026-09-30', count: 3 }, { date: '2026-10-01', count: 1 }, { date: '2026-10-03', count: 2 },
    { date: '2026-10-05', count: 0 }, { date: '2026-10-09', count: 1 },
  ]
  assert.equal(monthStudyDays(a, '2026-10-09'), 3)
  assert.equal(monthStudyDays([], '2026-10-09'), 0)
})

test('タイマーの経過時間の表示', () => {
  const start = '2026-10-09T00:00:00Z'
  const at = (sec: number) => new Date(start).getTime() + sec * 1000
  assert.equal(elapsedLabel(start, at(0)), '0:00')
  assert.equal(elapsedLabel(start, at(754)), '12:34')
  assert.equal(elapsedLabel(start, at(3725)), '1:02:05')
  assert.equal(elapsedLabel(start, at(-5)), '0:00')
  assert.equal(elapsedMinutes(start, at(179)), 2)
})

test('終了し忘れの分数：経過時間より長くはできない', () => {
  assert.deepEqual(validateMinutes('45', 180), { ok: true, value: 45 })
  assert.deepEqual(validateMinutes('180', 180), { ok: true, value: 180 })
  assert.equal(validateMinutes('181', 180).ok, false)
  assert.equal(validateMinutes('', 180).ok, false)
  assert.equal(validateMinutes('4.5', 180).ok, false)
  assert.equal(validateMinutes('-3', 180).ok, false)
})

test('内容は任意。書くなら 60 文字まで', () => {
  assert.deepEqual(validateContent('   '), { ok: true, value: null })
  assert.deepEqual(validateContent(' 英単語 '), { ok: true, value: '英単語' })
  assert.equal(validateContent('あ'.repeat(61)).ok, false)
  assert.equal(validateContent('あ'.repeat(60)).ok, true)
})

test('コインの一言：付かなかったときは出さない', () => {
  assert.equal(coinNote(0), '')
  assert.equal(coinNote(3), '＋3コイン')
})

const base = { startedAt: '2026-10-10T10:00:00Z', pausedAt: null, pausedSeconds: 0, targetSeconds: 900 }
const at = (sec: number) => new Date('2026-10-10T10:00:00Z').getTime() + sec * 1000

test('focusProgress: 開始直後は 15:00 で 0 目盛り', () => {
  const p = focusProgress(base, at(0))
  assert.equal(p.label, '15:00')
  assert.equal(p.ticks, 0)
  assert.equal(p.reached, false)
})

test('focusProgress: 6 分 20 秒で残り 8:40・6 目盛り', () => {
  const p = focusProgress(base, at(380))
  assert.equal(p.label, '8:40')
  assert.equal(p.ticks, 6)
})

test('focusProgress: 15 分で 0:00・15 目盛り・達成。超えても 0:00', () => {
  assert.equal(focusProgress(base, at(900)).reached, true)
  const p = focusProgress(base, at(1500))
  assert.equal(p.label, '0:00')
  assert.equal(p.ticks, 15)
})

test('focusProgress: 一時停止中は止めた時点で固定し、停止分は引く', () => {
  const paused = { ...base, pausedAt: new Date(at(300)).toISOString() }
  const p = focusProgress(paused, at(900))
  assert.equal(p.label, '10:00')
  assert.equal(p.paused, true)
  const resumed = focusProgress({ ...base, pausedSeconds: 120 }, at(420))
  assert.equal(resumed.label, '10:00')
})

test('focusNote: 達成と途中終了で文面を分ける', () => {
  assert.equal(focusNote({ focusAchieved: true, focusBonus: 5, coinsGranted: 1, durationSeconds: 900 }), '15分集中を達成しました　＋6コイン')
  assert.equal(focusNote({ focusAchieved: false, focusBonus: 0, coinsGranted: 0, durationSeconds: 420 }), '7分の集中を記録しました')
})
