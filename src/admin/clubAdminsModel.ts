// 画面14：クラブ管理者の追加・解除の表示ロジック（画面にも通信にも依存しない）

export type ClubAdmin = { userId: string; email: string; displayName: string | null }

export const ADMIN_NAME_MAX = 20
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** 追加フォームの入力の問題。なければ null */
export function addProblem(emailRaw: string, nameRaw: string): string | null {
  const email = normalizeEmail(emailRaw)
  if (email === '') return 'メールアドレスを入力してください'
  if (email.length > 254 || !EMAIL.test(email)) return 'メールアドレスの形式を確認してください'
  if ([...nameRaw.trim()].length > ADMIN_NAME_MAX) return `表示名は${ADMIN_NAME_MAX}文字までです`
  return null
}

export function adminLabel(a: ClubAdmin): string {
  return a.displayName ? `${a.displayName}（${a.email}）` : a.email
}

export const ADD_DONE = '追加しました。本人が管理画面で、このメールアドレスにログインリンクを送ると入れます。'

export function adminErrorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  const table: Record<string, string> = {
    invalid_email: 'メールアドレスの形式を確認してください。',
    invalid_name: `表示名は${ADMIN_NAME_MAX}文字までです。`,
    not_allowed: 'このメールアドレスは、生徒または運営として登録されているため、クラブ管理者にできません。',
    already_admin: 'このメールアドレスは、すでにこのクラブの管理者です。',
    other_club: 'このメールアドレスは、ほかのクラブに所属しています（1人が同時に所属できるクラブは1つです）。先にそのクラブから解除してください。',
    not_found: '解除する管理者が見つかりませんでした。画面を開き直してください。',
    forbidden: 'クラブ管理者を変えられるのは運営だけです。',
  }
  for (const [k, v] of Object.entries(table)) if (text.includes(k)) return v
  return '保存できませんでした。通信を確認して、もう一度お試しください。'
}
