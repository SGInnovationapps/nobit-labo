// 生徒一覧（09）と生徒の詳細（10）の表示ロジック。画面にも通信にも依存しない純粋な関数。
import { addDays } from '../home/homeModel.ts'
import type { BandCell } from '../home/homeModel.ts'

export type DayState = 'all' | 'partial' | 'none'
export const STATE_TEXT: Record<DayState, string> = { all: 'すべて完了', partial: '一部完了', none: '未着手' }

export type StudentRow = {
  userId: string
  displayName: string | null
  grade: number | null
  /** 今日配信されたタスク（自由登録は含めない）の数と、完了した数 */
  assignedTotal: number
  assignedDone: number
  /** 今日の完了数（自由登録を含む） */
  activityToday: number
  currentDays: number
  longestDays: number
  lastAchievedDate: string | null
  /** 直近14日の日別の完了数 */
  activity: { date: string; count: number }[]
}

/**
 * 今日の状態。配信されたタスクがあれば、その完了で決める。
 * 配信がなければ、今日の完了（自由登録を含む）があるかどうかで決める。
 */
export function dayState(assignedTotal: number, assignedDone: number, activityToday: number): DayState {
  if (assignedTotal > 0) {
    if (assignedDone >= assignedTotal) return 'all'
    return assignedDone > 0 || activityToday > 0 ? 'partial' : 'none'
  }
  return activityToday > 0 ? 'all' : 'none'
}

export function stateOf(s: StudentRow): DayState {
  return dayState(s.assignedTotal, s.assignedDone, s.activityToday)
}

function diffDays(from: string, to: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((ms(to) - ms(from)) / 86_400_000)
}

/** 最後に達成した日から今日まで何日空いたか。記録がなければ null */
export function gapDays(lastAchievedDate: string | null, today: string): number | null {
  return lastAchievedDate ? diffDays(lastAchievedDate, today) : null
}

export const GAP_ALERT_DAYS = 3 // ［仮］記録が3日空いたら、対応が必要

export type Attention = { rank: 0 | 1 | 2 | 3; reason: string | null }

/** 対応が必要な順。0 = 記録が空いている、1 = 今日は未着手、2 = 一部完了、3 = すべて完了 */
export function attentionOf(s: StudentRow, today: string): Attention {
  const gap = gapDays(s.lastAchievedDate, today)
  const state = stateOf(s)
  if (gap === null) return state === 'all' ? { rank: 3, reason: null } : { rank: 0, reason: 'まだ記録がありません' }
  if (gap >= GAP_ALERT_DAYS && state !== 'all') return { rank: 0, reason: `記録が${gap}日空いています` }
  if (state === 'none') return { rank: 1, reason: '今日はまだ未着手です' }
  if (state === 'partial') return { rank: 2, reason: null }
  return { rank: 3, reason: null }
}

export function sortByAttention(list: ReadonlyArray<StudentRow>, today: string): StudentRow[] {
  const key = (s: StudentRow) => {
    const a = attentionOf(s, today)
    const gap = gapDays(s.lastAchievedDate, today)
    // 同じ段の中では、空いた日数が長い順（記録なしが最も長い）
    return { rank: a.rank, gap: gap === null ? Number.MAX_SAFE_INTEGER : gap }
  }
  return [...list].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka.rank !== kb.rank) return ka.rank - kb.rank
    if (ka.rank <= 1 && ka.gap !== kb.gap) return kb.gap - ka.gap
    return (a.displayName ?? '').localeCompare(b.displayName ?? '', 'ja')
  })
}

export type Filter = 'any' | DayState

export function filterStudents(list: ReadonlyArray<StudentRow>, filter: Filter, query: string): StudentRow[] {
  const q = query.trim().toLowerCase()
  return list.filter((s) => {
    if (filter !== 'any' && stateOf(s) !== filter) return false
    if (q && !(s.displayName ?? '').toLowerCase().includes(q)) return false
    return true
  })
}

export function countStates(list: ReadonlyArray<StudentRow>): Record<DayState, number> {
  const c: Record<DayState, number> = { all: 0, partial: 0, none: 0 }
  for (const s of list) c[stateOf(s)]++
  return c
}

/** 最終学習の表示 */
export function lastStudyLabel(lastAchievedDate: string | null, today: string): string {
  const gap = gapDays(lastAchievedDate, today)
  if (gap === null) return '記録なし'
  if (gap <= 0) return '今日'
  if (gap === 1) return '昨日'
  return `${gap}日前`
}

/** 記録の帯（直近 days 日）。棒の段階は、最大値に対する割合で決める（クラブ全体の合計用） */
export function buildScaledBand(activity: ReadonlyArray<{ date: string; count: number }>, today: string, days = 14): BandCell[] {
  const counts = new Map(activity.map((a) => [a.date, a.count]))
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1))
  const max = Math.max(0, ...dates.map((d) => counts.get(d) ?? 0))
  return dates.map((date): BandCell => {
    const count = counts.get(date) ?? 0
    const today_ = date === today
    if (count <= 0) return { kind: 'none', date, today: today_ }
    const r = count / max
    const level = r > 2 / 3 ? 3 : r > 1 / 3 ? 2 : 1
    return { kind: 'done', date, today: today_, level, count }
  })
}

export type Week = { start: string; days: number; level: 0 | 1 | 2 | 3 }

function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = 日
  return addDays(date, -((dow + 6) % 7))
}

/** 週ごとの学習した日数（月〜日、直近 weeks 週。最後が今週） */
export function weeklyDays(activityDates: ReadonlyArray<string>, today: string, weeks = 12): Week[] {
  const thisMonday = mondayOf(today)
  const list: Week[] = Array.from({ length: weeks }, (_, i) => ({ start: addDays(thisMonday, (i - weeks + 1) * 7), days: 0, level: 0 as const }))
  const index = new Map(list.map((w, i) => [w.start, i]))
  for (const d of new Set(activityDates)) {
    const i = index.get(mondayOf(d))
    if (i !== undefined) list[i].days++
  }
  return list.map((w) => ({ ...w, level: w.days === 0 ? 0 : w.days <= 2 ? 1 : w.days <= 4 ? 2 : 3 }))
}

/** 今月の学習日数（日本時間の月） */
export function monthDays(activityDates: ReadonlyArray<string>, today: string): number {
  const ym = today.slice(0, 7)
  return new Set(activityDates.filter((d) => d.startsWith(ym))).size
}

export type SubjectCount = { subject: string; count: number; ratio: number }

/** 教科別の完了数。多い順 */
export function subjectBreakdown(subjects: ReadonlyArray<string>): SubjectCount[] {
  const map = new Map<string, number>()
  for (const s of subjects) map.set(s, (map.get(s) ?? 0) + 1)
  const max = Math.max(1, ...map.values())
  return [...map.entries()]
    .map(([subject, count]) => ({ subject, count, ratio: count / max }))
    .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject, 'ja'))
}

export const COMMENT_MAX = 300

export function commentError(body: string): string | null {
  const t = body.trim()
  if (t.length === 0) return '応援のことばを入力してください'
  if (t.length > COMMENT_MAX) return `${COMMENT_MAX}文字までです`
  return null
}
