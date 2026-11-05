import assert from 'node:assert/strict'
import { test } from 'node:test'
import { capsuleColor, GACHA_ODDS } from '../src/home/collectionModel.ts'
import { COIN, coinNote, gainedCoins, homeNobit } from '../src/home/homeModel.ts'

test('コインは🪙で表す。増えるときは +', () => {
  assert.equal(COIN, '🪙')
  assert.equal(coinNote(11), '🪙+11')
  assert.equal(coinNote(0), '')
})

test('gainedCoins: 学習した日・課題・クエスト・ウィークリーの合計', () => {
  assert.equal(gainedCoins({ coinsGranted: 11 }), 11)
  assert.equal(gainedCoins({ coinsGranted: 1, newQuests: [{ coins: 3 }, { coins: 5 }], newWeek: { subjectQuest: { coins: 10 } } }), 19)
  assert.equal(gainedCoins({ coinsGranted: 1, newQuests: [], newWeek: { subjectQuest: null } }), 1)
})

test('homeNobit: 状態で表情とことばが変わる。タスク完了・再開は面で出すので null', () => {
  assert.equal(homeNobit('notyet', 0, null)?.mood, 'wave')
  assert.match(homeNobit('notyet', 0, null)?.lines.join('') ?? '', /教科をタップ/)
  assert.equal(homeNobit('first', 0, null)?.mood, 'wave')
  assert.deepEqual(homeNobit('recording', 2, '理科'), { mood: 'happy', lines: ['理科、記録したよ！', '今日の記録は 2件。'] })
  assert.equal(homeNobit('recording', 3, null)?.lines[0], '今日の自分、3件すすんだ。')
  assert.equal(homeNobit('done', 3, null), null)
  assert.equal(homeNobit('resume', 0, null), null)
})

test('capsuleColor: ノーマル＝ミント、レア＝紫、スーパーレア＝金', () => {
  assert.equal(capsuleColor('normal').top, '#38cda1')
  assert.equal(capsuleColor('rare').top, '#9b8afb')
  assert.equal(capsuleColor('super_rare').top, '#ffd45e')
  assert.match(GACHA_ODDS, /70%.*25%.*5%/)
})
