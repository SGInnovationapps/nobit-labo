import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error 変換の道具は .mjs のまま（型は付けない）
import { collectRows, defaultDest, normalize, toGrade, toSql } from '../scripts/questions-to-sql.mjs'

type Row = Record<string, unknown>
const ok = (row: Row, seq = 1) => normalize(row, seq) as Record<string, unknown>

const labodori: Row = {
  id: 'sci_1_001', subject: '理科', grade: 1, category: '気体の性質', difficulty: 1,
  question: '酸素を集める方法はどれか',
  choice_1: '水上置換', choice_2: '上方置換', choice_3: '下方置換', choice_4: '加熱',
  explanation: '酸素は水に溶けにくい',
}

test('collectRows: 配列でも、教科や学年で分けた入れ物でも集められる', () => {
  assert.equal(collectRows([labodori, labodori]).length, 2)
  assert.equal(collectRows({ 理科: { 1: [labodori], 2: [labodori, labodori] } }).length, 3)
  assert.equal(collectRows({}).length, 0)
})

test('toGrade: 「中1」「中学1年」も1として読む', () => {
  assert.equal(toGrade(1), 1)
  assert.equal(toGrade('中1'), 1)
  assert.equal(toGrade('中学3年'), 3)
  assert.equal(toGrade('高1'), 1)
  assert.equal(toGrade('なし'), null)
  assert.equal(toGrade(null), null)
})

test('normalize: ラボドリの形から、choice_1 を正解として読む', () => {
  const r = ok(labodori)
  assert.equal(r.id, 'sci_1_001')
  assert.equal(r.answer, '水上置換')
  assert.deepEqual(r.distractors, ['上方置換', '下方置換', '加熱'])
  assert.equal(r.difficulty, 1)
  assert.equal(r.explanation, '酸素は水に溶けにくい')
  assert.equal(r.imageUrl, null)
})

test('normalize: 選択肢の配列と、正解をべつに持つ形も読む', () => {
  const r = ok({ subject: '社会', grade: '中2', 単元: '歴史', 問題: '問', choices: ['あ', 'い', 'う', 'え'], answer: 'う' })
  assert.equal(r.answer, 'う')
  assert.deepEqual(r.distractors, ['あ', 'い', 'え'])
  assert.equal(r.grade, 2)
  assert.equal(r.category, '歴史')
})

test('normalize: id がなければ、教科と学年から作る', () => {
  const { id, ...rest } = labodori
  void id
  assert.equal(ok(rest, 7).id, 'sci_1_0007')
})

test('normalize: 足りないものは理由を返す（取り込まない）', () => {
  assert.match(normalize({ ...labodori, subject: '数学' }, 1).reason, /教科が/)
  assert.match(normalize({ ...labodori, grade: 'なし' }, 1).reason, /学年が/)
  assert.match(normalize({ ...labodori, category: '' }, 1).reason, /単元がない/)
  assert.match(normalize({ ...labodori, question: '' }, 1).reason, /問題文がない/)
  assert.match(normalize({ ...labodori, choice_4: null }, 1).reason, /誤答が3つ/)
  assert.match(normalize({ ...labodori, id: 'だめな id' }, 1).reason, /使えない文字/)
})

test('normalize: 正解と同じ選択肢が重なっていても、誤答は3つに保つ', () => {
  const r = normalize({ ...labodori, choice_2: '水上置換' }, 1)
  assert.match(r.reason, /誤答が3つ/)
})

test("toSql: 文字列の ' を二重にして壊さない", () => {
  const sql = toSql([ok({ ...labodori, question: "it's a test", explanation: null })])
  assert.match(sql, /'it''s a test'/)
  assert.match(sql, /null\)/)
  assert.match(sql, /^begin;$/m)
  assert.match(sql, /^commit;$/m)
  assert.match(sql, /on conflict \(id\) do update set/)
})

test('defaultDest: 今日の日付（JST）のマイグレーションに書き出す', () => {
  assert.equal(defaultDest(new Date('2026-10-16T02:58:00Z')), 'supabase/migrations/20261016160000_questions.sql')
  // UTC では前日でも、JST の日付で決める
  assert.equal(defaultDest(new Date('2026-10-16T16:00:00Z')), 'supabase/migrations/20261017160000_questions.sql')
})
