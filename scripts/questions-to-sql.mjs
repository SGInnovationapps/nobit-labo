#!/usr/bin/env node
// ラボドリの questions.json を、問題バンクに入れる SQL に変換する。
//
//   node scripts/questions-to-sql.mjs <questions.json> [出力先.sql]
//
// 出力先の既定は supabase/migrations/<今日の日付>160000_questions.sql。
// そのまま supabase db push で本番に入る（1000問ずつの insert に分かれる）。
// 同じ id は上書きするので、問題を直したら作り直して push し直せばよい。
// 同じ日に作り直すと同じファイルを上書きし、別の日に作り直すと新しいマイグレーションになる。
//
// 受け取れる形（どちらでもよい）
//   ・配列                     [ {...}, {...} ]
//   ・教科や学年で分けた入れ物   { "理科": { "1": [ {...} ] } } のように、入れ子の中の配列を集める
//
// 1件に要る値（別名も見る）
//   id                                    なければ <教科3文字>_<学年>_<連番> を作る
//   subject / 教科                        英語・理科・社会
//   grade / 学年                          1〜3（「中1」「中学1年」も読む）
//   category / unit / 単元                単元の名前
//   question / body / 問題                 問題文
//   choice_1〜choice_4 / choices / 選択肢   choice_1（配列なら1つめ）が正解
//   answer / 正解                         正解をべつに持つときはこちら
//   explanation / 解説                     任意
//   image_url / image                     任意

import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const SUBJECTS = ['英語', '理科', '社会']
const CODE = { 英語: 'eng', 理科: 'sci', 社会: 'soc' }
const CHUNK = 1000

const pick = (row, names) => {
  for (const n of names) {
    const v = row[n]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return null
}

/** 入れ子の入れ物からも、問題の配列を集める */
export function collectRows(data) {
  const out = []
  const walk = (v) => {
    if (Array.isArray(v)) {
      for (const x of v) {
        if (x && typeof x === 'object' && !Array.isArray(x)) out.push(x)
        else walk(x)
      }
      return
    }
    if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  walk(data)
  return out
}

export function toGrade(v) {
  if (v === null) return null
  const m = String(v).match(/[1-3]/)
  return m ? Number(m[0]) : null
}

/** 1件を、問題バンクの列に合わせた形にする。足りないものは reason を返す */
export function normalize(row, seq) {
  const subject = pick(row, ['subject', '教科', 'kyoka'])
  if (!SUBJECTS.includes(subject)) return { reason: `教科が英語・理科・社会のどれでもない（${subject ?? 'なし'}）` }
  const grade = toGrade(pick(row, ['grade', '学年', 'gakunen']))
  if (grade === null) return { reason: '学年が1〜3で読めない' }
  const category = pick(row, ['category', 'unit', '単元', 'tangen'])
  if (!category) return { reason: '単元がない' }
  const body = pick(row, ['question', 'body', '問題', 'text'])
  if (!body) return { reason: '問題文がない' }

  const list = pick(row, ['choices', '選択肢'])
  const choices = Array.isArray(list)
    ? list.map((c) => String(c))
    : [1, 2, 3, 4].map((i) => pick(row, [`choice_${i}`, `choice${i}`, `選択肢${i}`])).filter((c) => c !== null).map(String)
  const answer = String(pick(row, ['answer', '正解', 'correct']) ?? choices[0] ?? '')
  const distractors = choices.filter((c) => c !== answer)
  if (!answer) return { reason: '正解がない' }
  if (distractors.length < 3) return { reason: `誤答が3つそろわない（選択肢 ${choices.length} 個）` }

  const id = String(pick(row, ['id', 'ID']) ?? `${CODE[subject]}_${grade}_${String(seq).padStart(4, '0')}`)
  if (!/^[A-Za-z0-9_.:-]{1,48}$/.test(id)) return { reason: `id に使えない文字がある（${id}）` }

  return {
    id, subject, grade, category: String(category).trim(),
    difficulty: toGrade(pick(row, ['difficulty', '難易度'])) ?? 1,
    body: String(body), answer, distractors: distractors.slice(0, 3),
    explanation: pick(row, ['explanation', '解説', 'commentary']),
    imageUrl: pick(row, ['image_url', 'image', '画像']),
  }
}

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const arr = (xs) => `array[${xs.map(q).join(', ')}]`

export function toSql(rows) {
  const out = ['-- ラボドリの問題バンク（scripts/questions-to-sql.mjs が作ったもの。手で直さない）', 'begin;']
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK)
    out.push(
      'insert into public.questions (id, subject, grade, category, difficulty, body, answer, distractors, explanation, image_url) values',
      part
        .map((r) => `  (${q(r.id)}, ${q(r.subject)}, ${r.grade}, ${q(r.category)}, ${r.difficulty}, ${q(r.body)}, ${q(r.answer)}, ${arr(r.distractors)}, ${q(r.explanation)}, ${q(r.imageUrl)})`)
        .join(',\n'),
      'on conflict (id) do update set',
      '  subject = excluded.subject, grade = excluded.grade, category = excluded.category,',
      '  difficulty = excluded.difficulty, body = excluded.body, answer = excluded.answer,',
      '  distractors = excluded.distractors, explanation = excluded.explanation,',
      '  image_url = excluded.image_url, active = true;',
      '',
    )
  }
  out.push('commit;', '', '-- 取り込めたかの確認', "select subject, grade, count(distinct category) as 単元, count(*) as 問題 from public.questions where active group by subject, grade order by subject, grade;")
  return out.join('\n') + '\n'
}

/** 既定の出力先。今日の日付のマイグレーションにして、そのまま db push できるようにする */
export function defaultDest(now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3600 * 1000) // JST
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, '')
  return `supabase/migrations/${stamp}160000_questions.sql`
}

function main() {
  const [src, dest = defaultDest()] = process.argv.slice(2)
  if (!src) {
    console.error('使い方: node scripts/questions-to-sql.mjs <questions.json> [出力先.sql]')
    process.exit(2)
  }
  const data = JSON.parse(readFileSync(src, 'utf8'))
  const raw = collectRows(data)
  if (raw.length === 0) {
    console.error('問題が1件も見つかりませんでした。JSON の形を確かめてください')
    process.exit(1)
  }

  const rows = []
  const skipped = []
  const seen = new Set()
  raw.forEach((row, i) => {
    const r = normalize(row, i + 1)
    if (r.reason) {
      skipped.push({ at: i + 1, reason: r.reason })
      return
    }
    if (seen.has(r.id)) {
      skipped.push({ at: i + 1, reason: `id が重なっている（${r.id}）` })
      return
    }
    seen.add(r.id)
    rows.push(r)
  })

  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, toSql(rows), 'utf8')

  const by = new Map()
  for (const r of rows) {
    const k = `${r.subject} 中${r.grade}`
    by.set(k, (by.get(k) ?? 0) + 1)
  }
  console.log(`読み込み ${raw.length} 件 → 取り込み ${rows.length} 件`)
  for (const [k, n] of [...by].sort()) console.log(`  ${k}　${n}問`)
  if (skipped.length > 0) {
    console.log(`飛ばした ${skipped.length} 件（先頭20件）`)
    for (const s of skipped.slice(0, 20)) console.log(`  ${s.at}件目：${s.reason}`)
  }
  console.log(`書き出しました：${dest}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main()
