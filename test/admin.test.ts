// 実行：node --experimental-strip-types test/admin.test.ts
import assert from 'node:assert/strict'
import { approvalBlockers, generateInviteCode, inviteUrl, formatJst } from '../src/admin/applicants.ts'

const ok = { displayName: 'a', grade: 8, consentedVersions: [1] }

// 承認できる条件（DB の review_membership と同じ）
assert.deepEqual(approvalBlockers(ok, 1), [])
assert.deepEqual(approvalBlockers({ ...ok, consentedVersions: [] }, 1), ['保護者の同意がまだです'])
assert.deepEqual(approvalBlockers({ ...ok, consentedVersions: [1] }, 2), ['保護者の同意がまだです']) // 古い版の同意だけ
assert.deepEqual(approvalBlockers({ ...ok, displayName: null }, 1), ['表示名と学年が未入力です'])
assert.deepEqual(approvalBlockers({ ...ok, grade: null }, 1), ['表示名と学年が未入力です'])
assert.equal(approvalBlockers({ displayName: null, grade: null, consentedVersions: [] }, 1).length, 2)
assert.deepEqual(approvalBlockers({ ...ok, consentedVersions: [] }, null), []) // 版がなければ同意は問わない

// 招待コード：DB の形式 ^[a-z0-9]{8,32}$ を満たす
const codes = new Set<string>()
for (let i = 0; i < 2000; i++) {
  const c = generateInviteCode()
  assert.match(c, /^[a-z0-9]{12}$/)
  codes.add(c)
}
assert.equal(codes.size, 2000)
// 偏りを避けるため、252 以上の値は捨てる
const bytes = [255, 254, 253, 252, 0, 1, 2, 35, 36, 71]
let called = 0
const fake = (n: number) => (called++ === 0 ? Uint8Array.from(bytes.slice(0, n)) : Uint8Array.from({ length: n }, (_, i) => i))
const c2 = generateInviteCode(fake, 6)
assert.match(c2, /^[a-z0-9]{6}$/)
assert.equal(c2.slice(0, 3), 'abc') // 先頭の 4 つは捨てられ、0,1,2 が a,b,c になる

assert.equal(inviteUrl('2001-abc', 'abcdef123456'), 'https://miniapp.line.me/2001-abc?invite=abcdef123456')
assert.equal(formatJst('2026-10-09T00:51:00Z'), '10/9 09:51')
assert.equal(formatJst(null), '')
console.log('ok')
