import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  daysLeftInWeek, newWeekNote, parseNewWeek, parseWeek, previousRewardNote, subjectQuestProgress, targetChangedNote,
  weekGoalNote, weekHistorySummary, weekRangeLabel,
} from '../src/home/weekModel.ts'
import type { WeekInfo } from '../src/home/weekModel.ts'
import { rewardGachaNote } from '../src/home/collectionModel.ts'

const raw = {
  week_start: '2026-10-26', today: '2026-10-28', target_days: 5, next_target_days: 5,
  study_dates: ['2026-10-26', '2026-10-27'], goal_achieved: false, reward_available: false, reward_week: null,
  reward_used: false,
  subject_quest: { best_subject: '英語', best_days: 2, achieved: false, achieved_subject: null, coins: 0 },
}
const week = (over: Partial<WeekInfo> = {}): WeekInfo => ({ ...parseWeek(raw)!, ...over })

test('parseWeek: my_week の結果を読む', () => {
  const w = parseWeek(raw)!
  assert.equal(w.targetDays, 5)
  assert.deepEqual(w.studyDates, ['2026-10-26', '2026-10-27'])
  assert.equal(w.subjectQuest.bestSubject, '英語')
  assert.equal(w.rewardWeek, null)
})

test('parseWeek: 形がおかしければ null。目標の日数は3〜7に収める', () => {
  assert.equal(parseWeek(null), null)
  assert.equal(parseWeek({ week_start: 'x' }), null)
  assert.equal(parseWeek({ ...raw, target_days: 9 })!.targetDays, 5)
  assert.equal(parseWeek({ ...raw, next_target_days: undefined })!.nextTargetDays, 5)
  assert.deepEqual(parseWeek({ ...raw, study_dates: ['2026-10-26', 3, 'x'] })!.studyDates, ['2026-10-26'])
})

test('daysLeftInWeek: 今日をふくめた残りの日数', () => {
  assert.equal(daysLeftInWeek('2026-10-26', '2026-10-26'), 7)
  assert.equal(daysLeftInWeek('2026-10-26', '2026-11-01'), 1)
  assert.equal(daysLeftInWeek('2026-10-26', '2026-11-02'), 0)
})

test('weekGoalNote: あと何日でごほうびか。届かない週は責めない', () => {
  assert.equal(weekGoalNote(week()), 'あと3日で、ごほうびのガチャ1回。')
  // 日曜で、まだ1日しか記録がない
  assert.match(weekGoalNote(week({ today: '2026-11-01', studyDates: ['2026-10-26'] })), /できる日に記録しよう/)
  // 日曜で、あと1日（今日まだ記録していない）なら届く
  assert.equal(weekGoalNote(week({ today: '2026-11-01', studyDates: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'] })),
    'あと1日で、ごほうびのガチャ1回。')
  // 日曜に記録したあとは、今日はもう数えない
  assert.match(weekGoalNote(week({ today: '2026-11-01', studyDates: ['2026-10-26', '2026-10-27', '2026-11-01'] })), /できる日に/)
  assert.equal(weekGoalNote(week({ goalAchieved: true, rewardAvailable: true, rewardWeek: '2026-10-26' })),
    '今週の目標を達成。ごほうびのガチャを1回引けます。')
  assert.equal(weekGoalNote(week({ goalAchieved: true })), '今週の目標を達成しました。')
})

test('previousRewardNote: 先週の分が残っているときだけ', () => {
  assert.equal(previousRewardNote(week()), null)
  assert.equal(previousRewardNote(week({ rewardAvailable: true, rewardWeek: '2026-10-26' })), null)
  assert.match(previousRewardNote(week({ rewardAvailable: true, rewardWeek: '2026-10-19' })) ?? '', /今週の日曜まで/)
})

test('subjectQuestProgress: 一番多い教科の日数（3で止める）', () => {
  assert.deepEqual(subjectQuestProgress(week()), { label: '英語', done: false, days: 2 })
  assert.deepEqual(subjectQuestProgress(week({ subjectQuest: { bestSubject: null, bestDays: 0, achieved: false, achievedSubject: null, coins: 0 } })),
    { label: '', done: false, days: 0 })
  assert.deepEqual(subjectQuestProgress(week({ subjectQuest: { bestSubject: '数学', bestDays: 4, achieved: true, achievedSubject: '英語', coins: 10 } })),
    { label: '英語', done: true, days: 3 })
})

test('parseNewWeek / newWeekNote: 今回あらたに達成したもの', () => {
  assert.equal(newWeekNote(parseNewWeek({})), '')
  assert.equal(newWeekNote(parseNewWeek(undefined)), '')
  assert.equal(newWeekNote(parseNewWeek({ goal: { target_days: 5, days: 5 } })), '週の目標を達成　ごほうびのガチャ1回')
  assert.equal(newWeekNote(parseNewWeek({ subject_quest: { subject: '理科', coins: 10 } })), 'ウィークリー達成「理科を週3日」　＋10コイン')
})

test('targetChangedNote: 今週からか来週からか', () => {
  assert.equal(targetChangedNote(3, 'this_week'), '今週の目標を3日にしました。')
  assert.equal(targetChangedNote(7, 'next_week'), '来週から、目標を7日にします。')
})

test('weekRangeLabel / weekHistorySummary', () => {
  assert.equal(weekRangeLabel('2026-09-28'), '9/28〜10/4')
  assert.deepEqual(weekHistorySummary([
    { weekStart: '2026-10-05', targetDays: 5, studyDays: 5, goalAchieved: true, subjectQuestSubject: '英語' },
    { weekStart: '2026-10-12', targetDays: 5, studyDays: 2, goalAchieved: false, subjectQuestSubject: null },
  ]), { weeks: 2, achieved: 1, subjectQuests: 1 })
})

test('rewardGachaNote: 先週の分は今週の日曜まで', () => {
  assert.match(rewardGachaNote('2026-10-19', '2026-10-26'), /先週/)
  assert.match(rewardGachaNote('2026-10-26', '2026-10-26'), /今週/)
})
