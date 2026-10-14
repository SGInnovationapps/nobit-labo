import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acquiredLabel, duplicateNote, equippedTitle, GACHA_NOTE, gachaState, groupCollection, setLabel,
} from '../src/home/collectionModel.ts'
import type { ItemDef, OwnedItem } from '../src/home/collectionModel.ts'

const items: ItemDef[] = [
  { id: 't1', name: 'はじめの一歩', category: 'title', rarity: 'normal', sortOrder: 10 },
  { id: 't2', name: 'ひらめき上手', category: 'title', rarity: 'rare', sortOrder: 20 },
  { id: 't3', name: 'ノビットの相棒', category: 'title', rarity: 'super_rare', sortOrder: 30 },
  { id: 'b1', name: 'ミント色の朝', category: 'background', rarity: 'normal', sortOrder: 10 },
  { id: 'g1', name: 'ガチャ初引き', category: 'badge', rarity: 'normal', sortOrder: 10 },
]
const owned: OwnedItem[] = [
  { itemId: 't1', acquiredAt: '2026-10-09T01:00:00Z', equipped: false },
  { itemId: 't3', acquiredAt: '2026-10-08T01:00:00Z', equipped: true },
  { itemId: 'g1', acquiredAt: '2026-10-07T01:00:00Z', equipped: false },
]

test('groupCollection: カテゴリごとの所持・未獲得、レアリティの高い順', () => {
  const g = groupCollection(items, owned)
  assert.deepEqual(g.map((x) => [x.key, x.owned.length, x.total, x.missing]), [
    ['title', 2, 3, 1], ['background', 0, 1, 1], ['decoration', 0, 0, 0], ['badge', 1, 1, 0],
  ])
  assert.deepEqual(g[0].owned.map((o) => o.id), ['t3', 't1'])
})

test('equippedTitle: 設定中の称号だけ', () => {
  assert.equal(equippedTitle(items, owned), 'ノビットの相棒')
  assert.equal(equippedTitle(items, owned.map((o) => ({ ...o, equipped: false }))), null)
})

test('gachaState: 引き済み・記録なし・引ける', () => {
  assert.equal(gachaState(0, false), 'no_record')
  assert.equal(gachaState(2, false), 'ready')
  assert.equal(gachaState(2, true), 'drawn')
  assert.ok(GACHA_NOTE.no_record.includes('1件記録'))
})

test('setLabel: バッジは設定できない', () => {
  assert.equal(setLabel('title'), '称号に設定する')
  assert.equal(setLabel('badge'), null)
})

test('acquiredLabel（JST）と duplicateNote', () => {
  assert.equal(acquiredLabel('2026-10-09T16:00:00Z'), '10月10日')
  assert.equal(duplicateNote(15), 'もっているので、＋15コインにかえました')
})

import { badgeProgressLabel, earnedOnLabel, splitBadges } from '../src/home/collectionModel.ts'
import type { BadgeRow } from '../src/home/collectionModel.ts'

const B = (code: string, rarity: BadgeRow['rarity'], goal: number, progress: number, earnedOn: string | null): BadgeRow =>
  ({ code, name: code, category: 'streak', rarity, goal, condition: '', earnedOn, progress })

test('splitBadges: 獲得はレアリティの高い順、同じなら新しい順。これからは進みの大きい順', () => {
  const { earned, upcoming } = splitBadges([
    B('a', 'normal', 3, 3, '2026-10-01'), B('b', 'rare', 7, 7, '2026-10-02'), B('c', 'normal', 1, 1, '2026-10-05'),
    B('d', 'super_rare', 30, 10, null), B('e', 'rare', 10, 9, null), B('f', 'normal', 1, 0, null),
  ])
  assert.deepEqual(earned.map((x) => x.code), ['b', 'c', 'a'])
  assert.deepEqual(upcoming.map((x) => x.code), ['e', 'd', 'f'])
})

test('badgeProgressLabel / earnedOnLabel', () => {
  assert.equal(badgeProgressLabel({ progress: 9, goal: 10 }), '9 / 10')
  assert.equal(earnedOnLabel('2026-10-04'), '10月4日')
})
