import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DRILL_TOTAL, drillErrorMessage, initialGradeMax, isDrillSubject, markedParts, modeLabel, progressLabel,
  recordedNote, resultCheer, sortUnits, unitLevel, unitState,
} from '../src/home/drillModel.ts'
import type { DrillUnit } from '../src/home/drillModel.ts'

const u = (category: string, questions: number, tried: number, correct: number): DrillUnit => ({
  category, questions, tried, correct, percent: tried === 0 ? 0 : Math.round((100 * correct) / tried),
})

test('isDrillSubject: ドリルがあるのは英語・理科・社会だけ', () => {
  assert.equal(isDrillSubject('理科'), true)
  assert.equal(isDrillSubject('数学'), false)
  assert.equal(isDrillSubject(''), false)
})

test('modeLabel: 記録の内容と同じ言い方', () => {
  assert.equal(modeLabel('mixed', null), 'おまかせ')
  assert.equal(modeLabel('wrong', '気体'), 'まちがえた問題')
  assert.equal(modeLabel('unit', '気体の性質'), '気体の性質')
  assert.equal(modeLabel('unit', null), '単元')
})

test('sortUnits: 解いた単元を先に、正解率の低い順', () => {
  const r = sortUnits([u('あ', 10, 0, 0), u('い', 10, 5, 5), u('う', 10, 4, 1), u('え', 10, 0, 0)])
  assert.deepEqual(r.map((x) => x.category), ['う', 'い', 'あ', 'え'])
})

test('sortUnits: 元の配列を変えない', () => {
  const src = [u('い', 10, 5, 5), u('う', 10, 4, 1)]
  sortUnits(src)
  assert.deepEqual(src.map((x) => x.category), ['い', 'う'])
})

test('unitState / unitLevel: 色だけでなく文字でも示す', () => {
  assert.equal(unitState(u('a', 10, 0, 0)), 'まだ')
  assert.equal(unitState(u('a', 10, 10, 9)), 'よくできている')
  assert.equal(unitState(u('a', 10, 10, 6)), 'あと少し')
  assert.equal(unitState(u('a', 10, 10, 2)), '伸ばしどころ')
  assert.equal(unitLevel(u('a', 10, 0, 0)), 0)
  assert.equal(unitLevel(u('a', 10, 10, 3)), 1)
  assert.equal(unitLevel(u('a', 10, 10, 5)), 2)
  assert.equal(unitLevel(u('a', 10, 10, 7)), 3)
  assert.equal(unitLevel(u('a', 10, 10, 10)), 4)
})

test('progressLabel: 答えた数ではなく「いま何問目か」を出し、最後で止まる', () => {
  assert.equal(progressLabel(0, 10), '1問目 / 10問')
  assert.equal(progressLabel(9, 10), '10問目 / 10問')
  assert.equal(progressLabel(10, 10), '10問目 / 10問')
})

test('resultCheer: できなかった日を責めない', () => {
  assert.equal(resultCheer(10, 10), '全問正解。よく積み上げた。')
  assert.equal(resultCheer(5, 10), '解いた分だけ、確かに進んだ。')
  assert.equal(resultCheer(1, 10), 'まちがえた問題は、あとでもう一度出てくる。')
  assert.equal(resultCheer(0, 10), 'いま解いたことが、次につながる。')
  assert.equal(resultCheer(0, 0), '記録しました。')
})

test('recordedNote: 教科の記録・タスクの完了・途中でやめた', () => {
  assert.equal(recordedNote(true, 'tag', '理科', 1), '理科を記録しました　コイン +1')
  assert.equal(recordedNote(true, 'tag', '理科', 0), '理科を記録しました')
  assert.equal(recordedNote(true, 'task', '社会', 10), 'タスクを完了しました　コイン +10')
  assert.equal(recordedNote(false, null, '英語', 0), '途中でやめたので、記録にはしていません。')
})

test('initialGradeMax: 中1 には中1 まで、高校生はすべて', () => {
  assert.equal(initialGradeMax(7), 1)
  assert.equal(initialGradeMax(8), 2)
  assert.equal(initialGradeMax(9), 3)
  assert.equal(initialGradeMax(12), 3)
  assert.equal(initialGradeMax(null), 3)
  assert.equal(initialGradeMax(undefined), 3)
})

test('drillErrorMessage: 画面に出す言い換え', () => {
  assert.match(drillErrorMessage(new Error('no_questions')), /問題がありません/)
  assert.match(drillErrorMessage(new Error('category_required')), /単元を選んで/)
  assert.match(drillErrorMessage(new Error('not_approved_student')), /登録が済んでいない/)
  assert.match(drillErrorMessage(new Error('session_not_found')), /もう一度始めて/)
  assert.match(drillErrorMessage(new Error('なにか別の失敗')), /通信できませんでした/)
  assert.match(drillErrorMessage(null), /通信できませんでした/)
})

test('DRILL_TOTAL は仕様書の10問', () => {
  assert.equal(DRILL_TOTAL, 10)
})

test('markedParts: 下線の印を、線を引くところと引かないところに分ける', () => {
  assert.deepEqual(markedParts('Draw a straight <u>line</u>.の下線部の意味はどれか。'), [
    { text: 'Draw a straight ', underline: false },
    { text: 'line', underline: true },
    { text: '.の下線部の意味はどれか。', underline: false },
  ])
  assert.deepEqual(markedParts('印のない問題文'), [{ text: '印のない問題文', underline: false }])
  assert.deepEqual(markedParts('<u>先頭</u>'), [{ text: '先頭', underline: true }])
  assert.deepEqual(markedParts('<U>大文字</U>も読む'), [
    { text: '大文字', underline: true },
    { text: 'も読む', underline: false },
  ])
  assert.deepEqual(markedParts('<u>ひとつめ</u>と<u>ふたつめ</u>'), [
    { text: 'ひとつめ', underline: true },
    { text: 'と', underline: false },
    { text: 'ふたつめ', underline: true },
  ])
})

test('markedParts: 閉じ忘れたタグは文字として出さず、取り除く', () => {
  assert.deepEqual(markedParts('閉じ忘れ<u>のこり'), [{ text: '閉じ忘れのこり', underline: false }])
  assert.deepEqual(markedParts('</u>だけ'), [{ text: 'だけ', underline: false }])
})

test('markedParts: 下線以外のタグらしい文字は、そのまま文字として出す（HTML として解釈しない）', () => {
  assert.deepEqual(markedParts('a < b と <script>alert(1)</script>'), [
    { text: 'a < b と <script>alert(1)</script>', underline: false },
  ])
})
