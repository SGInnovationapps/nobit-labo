// 実行：node --experimental-strip-types test/onboarding.test.ts
import assert from 'node:assert/strict'
import { deriveStep, progressOf, validateDisplayName, gradeLabel, type Snapshot } from '../src/lib/steps.ts'
import { parseInvite, normalizeInvite } from '../src/lib/invite.ts'

const base: Snapshot = {
  userId: 'u1',
  role: 'student',
  displayName: null,
  grade: null,
  membership: { id: 'm1', clubId: 'c1', clubName: '［クラブ名］', status: 'pending' },
  latestScope: { version: 1, summary: 's' },
  consentedVersions: [],
}
const step = (over: Partial<Snapshot>) => deriveStep({ ...base, ...over })

// 流れ：同意 → 表示名・学年 → 承認待ち → 承認
assert.deepEqual(step({}), { name: 'consent', reconsent: false })
assert.deepEqual(step({ consentedVersions: [1] }), { name: 'profile' })
assert.deepEqual(step({ consentedVersions: [1], displayName: 'a' }), { name: 'profile' })
assert.deepEqual(step({ consentedVersions: [1], grade: 8 }), { name: 'profile' })
assert.deepEqual(step({ consentedVersions: [1], displayName: 'a', grade: 8 }), { name: 'waiting' })
const approved = { ...base.membership!, status: 'approved' as const }
assert.deepEqual(step({ membership: approved, consentedVersions: [1], displayName: 'a', grade: 8 }), { name: 'approved' })

// 閲覧範囲の版が上がったら、承認済みでも同意を取り直す
assert.deepEqual(
  step({ membership: approved, consentedVersions: [1], displayName: 'a', grade: 8, latestScope: { version: 2, summary: 's' } }),
  { name: 'consent', reconsent: true },
)
// 新しい版にも同意していれば通る
assert.deepEqual(
  step({ membership: approved, consentedVersions: [1, 2], displayName: 'a', grade: 8, latestScope: { version: 2, summary: 's' } }),
  { name: 'approved' },
)

// 所属がない・退会・却下・生徒以外
assert.deepEqual(step({ membership: null }), { name: 'need_invite' })
assert.deepEqual(step({ membership: { ...approved, status: 'left' } }), { name: 'need_invite' })
assert.deepEqual(step({ membership: { ...approved, status: 'rejected' } }), { name: 'rejected' })
assert.deepEqual(step({ role: 'club_admin' }), { name: 'not_student' })
assert.deepEqual(step({ role: 'operator', membership: null }), { name: 'not_student' })

// 進み具合
assert.equal(progressOf({ name: 'consent', reconsent: false }), 1)
assert.equal(progressOf({ name: 'consent', reconsent: true }), null)
assert.equal(progressOf({ name: 'profile' }), 2)
assert.equal(progressOf({ name: 'waiting' }), 3)
assert.equal(progressOf({ name: 'approved' }), null)

// 表示名（文字数は DB と同じ数え方）
assert.deepEqual(validateDisplayName('  けん  '), { ok: true, value: 'けん' })
assert.equal(validateDisplayName('   ').ok, false)
assert.equal(validateDisplayName('あ'.repeat(20)).ok, true)
assert.equal(validateDisplayName('あ'.repeat(21)).ok, false)
assert.equal(validateDisplayName('😀'.repeat(20)).ok, true)
assert.equal(gradeLabel(10), '高1')
assert.equal(gradeLabel(null), '')

// 招待コード
assert.equal(parseInvite('?invite=ABCDEF123456'), 'abcdef123456')
assert.equal(parseInvite('?liff.state=%3Finvite%3Dabcdef123456'), 'abcdef123456')
assert.equal(parseInvite('?liff.state=%2Fstart%3Finvite%3Dabcdef123456%26x%3D1'), 'abcdef123456')
assert.equal(parseInvite('?invite=short'), null)
assert.equal(parseInvite('?invite=abc%20def%20ghi%20'), null)
assert.equal(parseInvite(''), null)
assert.equal(normalizeInvite(' ABCDEFGH '), 'abcdefgh')
assert.equal(normalizeInvite("x'; drop table"), null)

console.log('ok')
