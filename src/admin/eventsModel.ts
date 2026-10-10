import { addDays } from '../home/homeModel.ts'

export type EventKind = 'tournament' | 'trip' | 'camp'

export const EVENT_KINDS: ReadonlyArray<{ key: EventKind; label: string }> = [
  { key: 'tournament', label: '大会' },
  { key: 'trip', label: '遠征' },
  { key: 'camp', label: '合宿' },
]

export const kindLabel = (k: EventKind): string => EVENT_KINDS.find((x) => x.key === k)?.label ?? k

export type ClubEvent = { id: string; date: string; kind: EventKind; note: string | null }

export const NOTE_MAX = 40

/** 今日以降は日付の近い順、過去は新しい順。今日と未来だけ削除できる */
export function splitEvents(events: ReadonlyArray<ClubEvent>, today: string): { upcoming: ClubEvent[]; past: ClubEvent[] } {
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const past = events.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date))
  return { upcoming, past }
}

/** 日付の入力を検証する。問題がなければ null */
export function dateProblem(date: string, today: string, existing: ReadonlyArray<ClubEvent>): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '日付を入力してください'
  if (date < today) return '今日より前の日は登録できません'
  if (date > addDays(today, 365)) return '登録できるのは1年先までです'
  if (existing.some((e) => e.date === date)) return 'この日はすでに登録されています'
  return null
}

export function noteProblem(note: string): string | null {
  return [...note.trim()].length > NOTE_MAX ? `メモは${NOTE_MAX}文字までです` : null
}

/** 登録の失敗を、画面に出す文にする */
export function eventErrorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  const table: Record<string, string> = {
    already_registered: 'この日はすでに登録されています。',
    past_date: '今日より前の日は登録・削除できません。',
    too_far: '登録できるのは1年先までです。',
    forbidden: 'このクラブの日程を変える権限がありません。',
  }
  for (const [k, v] of Object.entries(table)) if (text.includes(k)) return v
  return '保存できませんでした。通信を確認して、もう一度お試しください。'
}
