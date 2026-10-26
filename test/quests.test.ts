import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  QUEST_ALL_BONUS, QUEST_COINS, QUEST_NAME, questCoinsEarned, questCoinsLeft, questNote, questsOf, questSummary,
} from '../src/home/homeModel.ts'
import type { HomeTask, Quest, TagRecord } from '../src/home/homeModel.ts'
import { questSummaryOf } from '../src/home/reflectModel.ts'
import { ADJUST_MAX, ADJUST_NOTE_MAX, adjustError, coinReasonLabel } from '../src/admin/studentModel.ts'

const q = (key: Quest['key'], done: boolean): Quest => ({ key, label: key, done, progress: '' })
const task = (id: string, subject: string, done: boolean, free = false): HomeTask => ({
  id, title: id, subject, estimatedMinutes: null, isFree: free, completedAt: done ? '2026-10-26T01:00:00Z' : null,
})
const tag = (subject: string): TagRecord => ({ id: subject, subject, recordedAt: '2026-10-26T01:00:00Z' })

test('questsOf: 配信タスクがなければ、クエストは2つ', () => {
  const none = questsOf({ tasks: [], tags: [], timerSeconds: 0, timerSubjects: [] })
  assert.deepEqual(none.map((x) => x.key), ['minutes', 'subjects'])
  const some = questsOf({ tasks: [task('t1', '英語', false)], tags: [], timerSeconds: 0, timerSubjects: [] })
  assert.deepEqual(some.map((x) => x.key), ['assigned', 'minutes', 'subjects'])
  // 自由登録は分母に入れない
  const free = questsOf({ tasks: [task('t1', '英語', false, true)], tags: [], timerSeconds: 0, timerSubjects: [] })
  assert.deepEqual(free.map((x) => x.key), ['minutes', 'subjects'])
})

test('questsOf: 達成の判定（DB の quest_state と同じ数え方）', () => {
  const r = questsOf({
    tasks: [task('t1', '英語', true)],
    tags: [tag('数学')],
    timerSeconds: 15 * 60,
    timerSubjects: ['数学'],
  })
  assert.deepEqual(r.map((x) => [x.key, x.done]), [['assigned', true], ['minutes', true], ['subjects', true]])

  const notYet = questsOf({ tasks: [task('t1', '英語', false)], tags: [tag('英語')], timerSeconds: 14 * 60, timerSubjects: [] })
  assert.deepEqual(notYet.map((x) => [x.key, x.done]), [['assigned', false], ['minutes', false], ['subjects', false]])
})

test('questCoinsLeft・questCoinsEarned: 残りと、もらった分', () => {
  const all = [q('assigned', true), q('minutes', true), q('subjects', true)]
  assert.equal(questCoinsLeft(all), 0)
  assert.equal(questCoinsEarned(all), QUEST_COINS * 3 + QUEST_ALL_BONUS)

  const two = [q('assigned', true), q('minutes', true), q('subjects', false)]
  assert.equal(questCoinsLeft(two), QUEST_COINS + QUEST_ALL_BONUS)
  assert.equal(questCoinsEarned(two), QUEST_COINS * 2)

  const none = [q('minutes', false), q('subjects', false)]
  assert.equal(questCoinsLeft(none), QUEST_COINS * 2 + QUEST_ALL_BONUS)
  assert.equal(questCoinsEarned(none), 0)

  // クエストがない日は、残りも取り分も 0
  assert.equal(questCoinsLeft([]), 0)
  assert.equal(questCoinsEarned([]), 0)
})

test('questSummary: 達成数は分数で', () => {
  assert.equal(questSummary([q('minutes', true), q('subjects', false)]), '1 / 2')
  assert.equal(questSummary([]), '0 / 0')
})

test('questNote: 記録したときの一言', () => {
  assert.equal(questNote([]), '')
  assert.equal(questNote([{ key: 'subjects', coins: 3 }]), `クエスト達成「${QUEST_NAME.subjects}」　＋3コイン`)
  assert.equal(questNote([{ key: 'minutes', coins: 3 }, { key: 'all', coins: 5 }]), 'クエストを2つ達成　＋8コイン')
  // 知らない key でも落とさない
  assert.equal(questNote([{ key: 'なぞ', coins: 0 }]), 'クエストを1つ達成')
})

test('questSummaryOf: ふりかえりの達成履歴のまとめ', () => {
  const r = questSummaryOf([
    { date: '2026-10-24', keys: ['minutes', 'subjects', 'all'], coins: 11 },
    { date: '2026-10-25', keys: ['subjects'], coins: 3 },
  ])
  assert.deepEqual(r, { days: 2, coins: 14, allDays: 1 })
  assert.deepEqual(questSummaryOf([]), { days: 0, coins: 0, allDays: 0 })
})

test('coinReasonLabel: クエストと運営の調整も名前が付く', () => {
  assert.equal(coinReasonLabel('daily_quest'), 'デイリークエスト')
  assert.equal(coinReasonLabel('quest_bonus'), 'クエスト全部達成')
  assert.equal(coinReasonLabel('admin_adjust'), '運営の調整')
  assert.equal(coinReasonLabel('なぞ'), 'なぞ')
})

test('adjustError: 運営のコイン調整の入力', () => {
  assert.equal(adjustError('10', '理由', 0), null)
  assert.equal(adjustError('-10', '理由', 10), null)
  assert.match(adjustError('', '理由', 10) ?? '', /入力してください/)
  assert.match(adjustError('1.5', '理由', 10) ?? '', /整数/)
  assert.match(adjustError('0', '理由', 10) ?? '', /0 では/)
  assert.match(adjustError(String(ADJUST_MAX + 1), '理由', 10) ?? '', /一度に動かせる/)
  assert.match(adjustError('-11', '理由', 10) ?? '', /残高が足りません/)
  assert.equal(adjustError('-10', '理由', 10), null, 'ちょうど 0 にはできる')
  assert.match(adjustError('10', '  ', 10) ?? '', /理由を入力/)
  assert.match(adjustError('10', 'あ'.repeat(ADJUST_NOTE_MAX + 1), 10) ?? '', /文字まで/)
})
