// 管理画面の純粋なロジック（通信・画面に依存しない）

export type Applicant = {
  membershipId: string
  userId: string
  displayName: string | null
  grade: number | null
  status: 'pending' | 'approved'
  createdAt: string
  reviewedAt: string | null
  consentedVersions: number[]
}

/** 承認できない理由（空なら承認できる）。DB の review_membership と同じ条件 */
export function approvalBlockers(
  a: Pick<Applicant, 'displayName' | 'grade' | 'consentedVersions'>,
  latestVersion: number | null,
): string[] {
  const reasons: string[] = []
  if (latestVersion !== null && !a.consentedVersions.includes(latestVersion)) reasons.push('保護者の同意がまだです')
  if (!a.displayName || a.grade === null) reasons.push('表示名と学年が未入力です')
  return reasons
}

export function formatJst(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const INVITE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
export const INVITE_LENGTH = 12

function defaultRandomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

/** 招待コードを作る（DB の形式 ^[a-z0-9]{8,32}$ に合わせる。偏りが出ないよう、余る値は捨てる） */
export function generateInviteCode(randomBytes: (n: number) => Uint8Array = defaultRandomBytes, length = INVITE_LENGTH): string {
  const limit = 256 - (256 % INVITE_CHARS.length)
  let out = ''
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit && out.length < length) out += INVITE_CHARS[b % INVITE_CHARS.length]
    }
  }
  return out
}

export function inviteUrl(liffId: string, code: string): string {
  return `https://miniapp.line.me/${liffId}?invite=${code}`
}
