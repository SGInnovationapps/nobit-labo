// 導入の流れで「いまどの画面を出すか」を決める。画面にも通信にも依存しない純粋な関数。

export type Role = 'student' | 'club_admin' | 'operator'
export type MembershipStatus = 'pending' | 'approved' | 'rejected' | 'left'

export type Snapshot = {
  userId: string
  role: Role
  displayName: string | null
  /** 7 = 中1 ... 12 = 高3 */
  grade: number | null
  membership: {
    id: string
    clubId: string
    clubName: string | null
    status: MembershipStatus
  } | null
  /** 最新の閲覧範囲の版（なければ null） */
  latestScope: { version: number; summary: string } | null
  /** この生徒が、所属クラブについて同意した版 */
  consentedVersions: number[]
}

export type Step =
  | { name: 'not_student' }
  | { name: 'need_invite' }
  | { name: 'rejected' }
  | { name: 'consent'; reconsent: boolean }
  | { name: 'profile' }
  | { name: 'waiting' }
  | { name: 'approved' }

export function deriveStep(s: Snapshot): Step {
  if (s.role !== 'student') return { name: 'not_student' }
  const m = s.membership
  if (!m || m.status === 'left') return { name: 'need_invite' }
  if (m.status === 'rejected') return { name: 'rejected' }

  // 閲覧範囲の版が上がったら、承認済みでも同意を取り直す
  if (s.latestScope && !s.consentedVersions.includes(s.latestScope.version)) {
    return { name: 'consent', reconsent: m.status === 'approved' }
  }
  if (!s.displayName || s.grade === null) return { name: 'profile' }
  return m.status === 'approved' ? { name: 'approved' } : { name: 'waiting' }
}

/** 進み具合の表示用。取り直しの同意と、承認後は出さない */
export function progressOf(step: Step): number | null {
  if (step.name === 'consent') return step.reconsent ? null : 1
  if (step.name === 'profile') return 2
  if (step.name === 'waiting') return 3
  return null
}

export const GRADES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 7, label: '中1' },
  { value: 8, label: '中2' },
  { value: 9, label: '中3' },
  { value: 10, label: '高1' },
  { value: 11, label: '高2' },
  { value: 12, label: '高3' },
]

export function gradeLabel(value: number | null): string {
  return GRADES.find((g) => g.value === value)?.label ?? ''
}

export const DISPLAY_NAME_MAX = 20

/** 表示名の検証。DB の char_length（文字数）と同じ数え方にする */
export function validateDisplayName(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.trim()
  const length = [...value].length
  if (length === 0) return { ok: false, message: '表示名を入力してください' }
  if (length > DISPLAY_NAME_MAX) return { ok: false, message: `表示名は${DISPLAY_NAME_MAX}文字までです` }
  return { ok: true, value }
}
