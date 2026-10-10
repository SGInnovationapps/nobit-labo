import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dateProblem, eventErrorMessage, kindLabel, noteProblem, rangeDays, rangeProblem, splitEvents } from '../src/admin/eventsModel.ts'
import type { ClubEvent } from '../src/admin/eventsModel.ts'
import { buildBand } from '../src/home/homeModel.ts'
import { calendarCells, periodOf } from '../src/home/reflectModel.ts'

const ev = (id: string, date: string): ClubEvent => ({ id, date, kind: 'tournament', note: null })

test('splitEvents: 今日以降は近い順、過去は新しい順', () => {
  const r = splitEvents([ev('a', '2026-10-25'), ev('b', '2026-09-01'), ev('c', '2026-10-09'), ev('d', '2026-09-20')], '2026-10-09')
  assert.deepEqual(r.upcoming.map((e) => e.id), ['c', 'a'])
  assert.deepEqual(r.past.map((e) => e.id), ['d', 'b'])
})

test('dateProblem: 空・過去・1年超・重複を弾く', () => {
  const ex = [ev('a', '2026-10-25')]
  assert.equal(dateProblem('2026-10-09', '2026-10-09', ex), null)
  assert.equal(dateProblem('2026-10-08', '2026-10-09', ex), '今日より前の日は登録できません')
  assert.equal(dateProblem('2026-10-25', '2026-10-09', ex), 'この日はすでに登録されています')
  assert.equal(dateProblem('2027-10-10', '2026-10-09', ex), '登録できるのは1年先までです')
  assert.equal(dateProblem('2027-10-09', '2026-10-09', ex), null)
  assert.equal(dateProblem('', '2026-10-09', ex), '日付を入力してください')
})

test('noteProblem・kindLabel・eventErrorMessage', () => {
  assert.equal(noteProblem('県大会'), null)
  assert.ok(noteProblem('あ'.repeat(41)))
  assert.equal(kindLabel('camp'), '合宿')
  assert.ok(eventErrorMessage(new Error('already_registered')).includes('すでに'))
  assert.ok(eventErrorMessage({ message: 'forbidden' }).includes('権限'))
  assert.ok(eventErrorMessage(null).includes('通信'))
})

test('休息日は記録の帯とカレンダーで rest になる。記録がある日は done のまま', () => {
  const cells = buildBand([{ date: '2026-10-08', count: 2 }], '2026-10-09', 4, ['2026-10-07', '2026-10-08'])
  assert.deepEqual(cells.map((c) => c.kind), ['none', 'rest', 'done', 'none'])
  const cal = calendarCells(periodOf('week', '2026-10-09'), [], '2026-10-09', ['2026-10-11'])
  assert.equal(cal.find((c) => c?.date === '2026-10-11')?.kind, 'rest')
})

test('rangeDays / rangeProblem: 期間の検証（開始日・終了日を含む、最大31日）', () => {
  assert.equal(rangeDays('2026-10-10', '2026-10-12'), 3)
  assert.equal(rangeDays('2026-10-10', '2026-10-10'), 1)
  assert.equal(rangeProblem('2026-10-10', '2026-10-12', '2026-10-09'), null)
  assert.match(rangeProblem('2026-10-08', '2026-10-12', '2026-10-09') ?? '', /今日より前/)
  assert.match(rangeProblem('2026-10-12', '2026-10-10', '2026-10-09') ?? '', /終了日/)
  assert.equal(rangeProblem('2026-10-10', '2026-11-09', '2026-10-09'), null) // 31日
  assert.match(rangeProblem('2026-10-10', '2026-11-10', '2026-10-09') ?? '', /31日/)
  assert.match(eventErrorMessage(new Error('range_too_long')), /31日/)
})
