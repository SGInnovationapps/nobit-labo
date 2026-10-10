// ふりかえり（06）の表示ロジック。画面にも通信にも依存しない純粋な関数。
import { addDays, levelOf, SUBJECTS } from './homeModel.ts'

export type ReflectMode = 'month' | 'week'

export type Period = { mode: ReflectMode; from: string; to: string; label: string }

/** 週の始まりは月曜。0 = 月 … 6 = 日 */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`

/** 基準日を含む月（または月〜日の週）の範囲 */
export function periodOf(mode: ReflectMode, anchor: string): Period {
  if (mode === 'month') {
    const y = Number(anchor.slice(0, 4))
    const m = Number(anchor.slice(5, 7))
    const from = `${anchor.slice(0, 7)}-01`
    const to = `${anchor.slice(0, 7)}-${String(lastDayOfMonth(y, m)).padStart(2, '0')}`
    return { mode, from, to, label: `${y}年${m}月` }
  }
  const from = addDays(anchor, -weekdayIndex(anchor))
  const to = addDays(from, 6)
  return { mode, from, to, label: `${md(from)}〜${md(to)}` }
}

/** 前の期間・次の期間の基準日 */
export function shiftAnchor(mode: ReflectMode, anchor: string, dir: -1 | 1): string {
  if (mode === 'week') return addDays(anchor, dir * 7)
  const y = Number(anchor.slice(0, 4))
  const m = Number(anchor.slice(5, 7)) - 1 + dir
  const d = new Date(Date.UTC(y, m, 1))
  return d.toISOString().slice(0, 10)
}

export type CalendarCell =
  | { kind: 'done'; date: string; day: number; today: boolean; level: 1 | 2 | 3; count: number }
  | { kind: 'rest'; date: string; day: number; today: boolean }
  | { kind: 'none'; date: string; day: number; today: boolean }
  | { kind: 'future'; date: string; day: number; today: boolean }

/** カレンダーの並び。月は月曜始まりで、月初の前に空きを入れる（null） */
export function calendarCells(
  period: Period,
  activity: ReadonlyArray<{ date: string; count: number }>,
  today: string,
  restDates: ReadonlyArray<string> = [],
): (CalendarCell | null)[] {
  const counts = new Map(activity.map((a) => [a.date, a.count]))
  const rests = new Set(restDates)
  const out: (CalendarCell | null)[] = []
  if (period.mode === 'month') for (let i = 0; i < weekdayIndex(period.from); i++) out.push(null)
  for (let date = period.from; date <= period.to; date = addDays(date, 1)) {
    const day = Number(date.slice(8, 10))
    const isToday = date === today
    const count = counts.get(date) ?? 0
    const level = levelOf(count)
    if (level) out.push({ kind: 'done', date, day, today: isToday, level, count })
    else if (rests.has(date)) out.push({ kind: 'rest', date, day, today: isToday })
    else if (date > today) out.push({ kind: 'future', date, day, today: isToday })
    else out.push({ kind: 'none', date, day, today: isToday })
  }
  return out
}

export type SubjectRow = { subject: string; tasks: number; records: number; minutes: number }
export type ReflectSummary = {
  studyDays: number
  completedTasks: number
  /** 集中モード・タイマーで計った時間（分） */
  timerMinutes: number
  subjects: SubjectRow[]
}

/**
 * 期間のまとめ。教科別は、完了タスク・教科タグ・タイマーの回数と、タイマーの分数。
 * 5 教科以外のタスクは「その他」にまとめる
 */
export function summarize(
  activity: ReadonlyArray<{ date: string; count: number }>,
  tasks: ReadonlyArray<{ subject: string }>,
  records: ReadonlyArray<{ subject: string; kind: 'tag' | 'timer'; durationSeconds: number | null }>,
): ReflectSummary {
  const names = [...SUBJECTS, 'その他']
  const rows = new Map<string, SubjectRow>(names.map((s) => [s, { subject: s, tasks: 0, records: 0, minutes: 0 }]))
  const rowOf = (s: string) => rows.get(rows.has(s) ? s : 'その他')!
  for (const t of tasks) rowOf(t.subject).tasks += 1
  let seconds = 0
  for (const r of records) {
    const row = rowOf(r.subject)
    row.records += 1
    if (r.kind === 'timer' && r.durationSeconds) {
      seconds += r.durationSeconds
      row.minutes += Math.floor(r.durationSeconds / 60)
    }
  }
  return {
    studyDays: activity.filter((a) => a.count > 0).length,
    completedTasks: tasks.length,
    timerMinutes: Math.floor(seconds / 60),
    subjects: [...rows.values()].filter((r) => r.tasks + r.records > 0),
  }
}

/** 分数の表示（95 → 1時間35分） */
export function minutesLabel(min: number): string {
  if (min < 60) return `${min}分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}時間` : `${h}時間${m}分`
}
