// 実行：node --experimental-strip-types test/consent.test.ts
import assert from 'node:assert/strict'
import { CONSENT_TEXT } from '../src/consentText.ts'

// 版ごとに、見出しと本文が空でない
for (const [v, sections] of Object.entries(CONSENT_TEXT)) {
  assert.ok(sections.length >= 4, `版 ${v}：項目が少ない`)
  for (const s of sections) {
    assert.ok(s.heading.trim() && s.body.trim(), `版 ${v}：空の項目 ${s.heading}`)
  }
}

const v3 = CONSENT_TEXT[3]
const text = v3.map((s) => s.heading + s.body).join('\n')
assert.ok(v3, '版 3 の文面がある')
assert.ok(text.includes('ACE LABO'), '運営の名前が入る')
assert.ok(text.includes('受け取らない'), '連絡を止められることが入る')
assert.ok(text.includes('手作業') && text.includes('自動'), '公式LINE の連絡は手作業・自動の両方')
assert.ok(text.includes('削除'), '記録の削除の依頼先が入る')
// クラブ管理者に見えないもの（教科の内訳・書いた内容）が明記されている
const club = v3.find((s) => s.heading === 'クラブの管理者が見られること')!
assert.ok(club.body.includes('内訳') && club.body.includes('書いた内容'), '見えない範囲が明記される')
// 同じ本文行が重複しない（React の key に使うため）
for (const s of v3) {
  const lines = s.body.split('\n')
  assert.equal(new Set(lines).size, lines.length, `重複した行：${s.heading}`)
}
console.log('consent ok')
