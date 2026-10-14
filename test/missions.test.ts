import assert from 'node:assert/strict'
import { test } from 'node:test'
import { percentOf, periodLabel, resultText, splitMissions, timeNote, rewardLines } from '../src/home/missionModel.ts'
import type { Mission } from '../src/home/missionModel.ts'
import { checkDraft, emptyDraft, reachedRate, missionAdminError, splitAdmin } from '../src/admin/missionAdminModel.ts'
import type { AdminMission } from '../src/admin/missionAdminModel.ts'

const base: Mission = {
  id: 'm1', title: 'T', description: null, metric: 'records', startsOn: '2026-10-12', endsOn: '2026-10-18',
  clubGoal: 100, personalGoal: 10, rewardPersonalCoins: 5, rewardClubCoins: 10, status: 'active',
  participants: 4, clubProgress: 40, personalReached: 1, joined: true, myProgress: 4, myPersonalRewarded: false, myClubRewarded: false,
}

test('percentOf は 0〜100 に収める', () => {
  assert.equal(percentOf(5, 10), 50)
  assert.equal(percentOf(30, 10), 100)
  assert.equal(percentOf(1, 0), 0)
})
test('periodLabel / timeNote', () => {
  assert.equal(periodLabel('2026-10-12', '2026-10-18'), '10月12日〜10月18日')
  assert.equal(timeNote(base, '2026-10-18'), '今日までです')
  assert.equal(timeNote(base, '2026-10-15'), 'あと3日（10月18日まで）')
  assert.equal(timeNote({ ...base, status: 'upcoming' }, '2026-10-10'), '10月12日から始まります')
  assert.equal(timeNote({ ...base, status: 'ended' }, '2026-10-20'), '終了しました')
})
test('rewardLines は0コインを出さない', () => {
  assert.deepEqual(rewardLines({ rewardPersonalCoins: 0, rewardClubCoins: 0 }), [])
  assert.equal(rewardLines(base).length, 2)
})
test('splitMissions と resultText', () => {
  const past = { ...base, id: 'm0', status: 'ended' as const, endsOn: '2026-10-05', startsOn: '2026-09-29' }
  const g = splitMissions([past, base])
  assert.equal(g.current.length, 1)
  assert.equal(g.past.length, 1)
  assert.equal(resultText({ ...past, joined: false }).me, 'あなた：不参加')
  assert.equal(resultText({ ...past, clubProgress: 100, myProgress: 10 }).club, 'クラブの目標：達成')
  assert.match(resultText({ ...past, myProgress: 3 }).me, /3 \/ 10/)
})

const ex: Pick<AdminMission, 'startsOn' | 'endsOn' | 'status'>[] = [{ startsOn: '2026-10-12', endsOn: '2026-10-18', status: 'upcoming' }]
const ok = { ...emptyDraft('2026-10-10'), title: 'A', startsOn: '2026-10-19', endsOn: '2026-10-25', clubGoal: '100', personalGoal: '10' }
test('checkDraft: 正常と各エラー', () => {
  assert.equal(checkDraft(ok, '2026-10-10', ex).problem, null)
  assert.equal(checkDraft(ok, '2026-10-10', ex).value?.rewardClub, 10)
  assert.match(checkDraft({ ...ok, title: ' ' }, '2026-10-10', ex).problem ?? '', /タイトル/)
  assert.match(checkDraft({ ...ok, endsOn: '2026-10-01' }, '2026-10-10', ex).problem ?? '', /終了日/)
  assert.match(checkDraft({ ...ok, startsOn: '2026-10-01', endsOn: '2026-10-05' }, '2026-10-10', []).problem ?? '', /終わった/)
  assert.match(checkDraft({ ...ok, startsOn: '2026-10-17' }, '2026-10-10', ex).problem ?? '', /重なって/)
  assert.match(checkDraft({ ...ok, endsOn: '2027-03-01' }, '2026-10-10', ex).problem ?? '', /93日/)
  assert.match(checkDraft({ ...ok, clubGoal: '0' }, '2026-10-10', ex).problem ?? '', /クラブの目標/)
  assert.match(checkDraft({ ...ok, personalGoal: 'a' }, '2026-10-10', ex).problem ?? '', /個人の目標/)
  assert.match(checkDraft({ ...ok, rewardClub: '-1' }, '2026-10-10', ex).problem ?? '', /報酬/)
})
test('取り消し済み・終了済みの期間とは重なっても作れる', () => {
  assert.equal(checkDraft({ ...ok, startsOn: '2026-10-12', endsOn: '2026-10-14' }, '2026-10-10', [{ startsOn: '2026-10-12', endsOn: '2026-10-18', status: 'ended' }]).problem, null)
})
test('reachedRate / splitAdmin / エラー文', () => {
  assert.equal(reachedRate({ participants: 0, personalReached: 0 }), null)
  assert.equal(reachedRate({ participants: 4, personalReached: 1 }), 25)
  const a = { ...base, students: [] } as AdminMission
  assert.equal(splitAdmin([a, { ...a, id: 'x', status: 'ended' }]).past.length, 1)
  assert.match(missionAdminError(new Error('period_overlap')), /重なって/)
  assert.match(missionAdminError(new Error('zzz')), /保存できません/)
})

import { bulkResultText, draftFromMission } from '../src/admin/missionAdminModel.ts'

const src: AdminMission = {
  id: 'm1', title: '秋の学習チャレンジ', description: '週に5日', metric: 'study_days', startsOn: '2026-09-01', endsOn: '2026-09-14',
  clubGoal: 200, personalGoal: 10, rewardPersonalCoins: 5, rewardClubCoins: 15, status: 'ended', participants: 8, clubProgress: 150, personalReached: 3, students: [],
}

test('draftFromMission: 期間は同じ長さで今日から。ほかは引き継ぐ', () => {
  const d = draftFromMission(src, '2026-10-12')
  assert.deepEqual(
    { ...d },
    { title: '秋の学習チャレンジ', description: '週に5日', metric: 'study_days', startsOn: '2026-10-12', endsOn: '2026-10-25', clubGoal: '200', personalGoal: '10', rewardPersonal: '5', rewardClub: '15' },
  )
  assert.equal(checkDraft(d, '2026-10-12', []).problem, null)
  // 説明がないものは空の文字になる
  assert.equal(draftFromMission({ ...src, description: null }, '2026-10-12').description, '')
  // 1日だけのミッションは1日のまま
  assert.equal(draftFromMission({ ...src, startsOn: '2026-09-01', endsOn: '2026-09-01' }, '2026-10-12').endsOn, '2026-10-12')
})

test('bulkResultText: 一括作成の結果（作れたクラブと、作れなかった理由）', () => {
  assert.deepEqual(bulkResultText([{ clubName: 'A', error: null }]), { text: 'ミッションを作りました。', allFailed: false })
  assert.deepEqual(bulkResultText([{ clubName: 'A', error: 'ほかのミッションと期間が重なっています。' }]), { text: 'ほかのミッションと期間が重なっています。', allFailed: true })
  const mixed = bulkResultText([{ clubName: 'A', error: null }, { clubName: 'B', error: '期間が重なっています。' }, { clubName: 'C', error: null }])
  assert.equal(mixed.allFailed, false)
  assert.equal(mixed.text, '2クラブにミッションを作りました。\nB：期間が重なっています。')
  assert.equal(bulkResultText([{ clubName: 'A', error: 'x' }, { clubName: 'B', error: 'y' }]).allFailed, true)
})
