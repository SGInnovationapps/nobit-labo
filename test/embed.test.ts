// club_members から users へは外部キーが2本（user_id・reviewed_by）ある。
// PostgREST の埋め込みで「users(...)」とだけ書くと、どちらを辿るか決まらずエラーになる（タスク管理が読み込めなかった原因）。
// 画面のコードで、club_members の select に名前なしの users( を書いていないことを確かめる
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : []
  })
}

test('club_members から users を埋め込むときは、外部キーの名前を指定している', () => {
  const bad: string[] = []
  for (const f of files('src')) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      // 同じ行か、次の数行の select に club_members が出てくる書き方を見る
      const near = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
      if (/from\('club_members'\)/.test(near) && /\busers\(/.test(line)) bad.push(`${f}:${i + 1}`)
    })
  }
  assert.deepEqual(bad, [])
})
