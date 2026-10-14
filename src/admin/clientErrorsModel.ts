// 画面のエラーの記録（運営のみ）を、対応アラートの画面に短く出すための整形

export type ClientErrorItem = {
  id: number
  occurredAt: string
  lastAt: string
  repeats: number
  app: 'student' | 'admin'
  kind: 'error' | 'rejection' | 'render' | 'handled'
  message: string
  stack: string | null
  path: string | null
  device: string | null
  appVersion: string | null
  displayName: string | null
  clubName: string | null
}

const KIND_LABEL: Record<ClientErrorItem['kind'], string> = {
  error: '拾えなかった例外',
  rejection: '拾えなかった失敗',
  render: '画面の描画',
  handled: '画面で案内したエラー',
}

const jst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString()

/** 例：10/14 22:41 */
export function stampOf(iso: string): string {
  const t = jst(iso)
  return `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))} ${t.slice(11, 16)}`
}

/** 見出しの一文。直近24時間にあれば注意として返す */
export function clientErrorNote(items: ClientErrorItem[], nowMs: number): { text: string; warn: boolean } {
  if (items.length === 0) return { text: '画面のエラー：直近7日はありません。', warn: false }
  const total = items.reduce((n, i) => n + i.repeats, 0)
  const day = items.filter((i) => nowMs - new Date(i.lastAt).getTime() <= 24 * 3600_000)
  const dayTotal = day.reduce((n, i) => n + i.repeats, 0)
  const latest = stampOf(items[0].lastAt)
  if (dayTotal === 0) return { text: `画面のエラー：直近24時間はありません（7日で ${total}回、最新 ${latest}）`, warn: false }
  return { text: `画面のエラー：直近24時間で ${dayTotal}回（7日で ${total}回、最新 ${latest}）`, warn: true }
}

/** 1件の補足の行：いつ・どの画面・だれ・端末・版・回数 */
export function clientErrorMeta(i: ClientErrorItem): string {
  const who = i.displayName ? `${i.displayName}${i.clubName ? `（${i.clubName}）` : ''}` : 'ログイン前'
  const parts = [
    stampOf(i.lastAt),
    i.app === 'student' ? '生徒の画面' : '管理画面',
    KIND_LABEL[i.kind],
    who,
    i.device,
    i.appVersion ? `版 ${i.appVersion}` : null,
    i.repeats > 1 ? `${i.repeats}回` : null,
  ]
  return parts.filter((p): p is string => !!p).join(' · ')
}
