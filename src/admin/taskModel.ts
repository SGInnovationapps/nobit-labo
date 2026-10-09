// タスク管理（画面11）の表示・入力ロジック。画面にも通信にも依存しない純粋な関数。
// 「今日の分として出すか」は、DB の sync_today_tasks() と同じ規則にそろえる［仮］。

export const SUBJECTS = ['英語', '数学', '国語', '理科', '社会'] as const
export type Subject = (typeof SUBJECTS)[number]

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly'
export const RECURRENCES: ReadonlyArray<{ value: Recurrence; label: string }> = [
  { value: 'none', label: 'なし' },
  { value: 'daily', label: '毎日' },
  { value: 'weekdays', label: '平日（月〜金）' },
  { value: 'weekly', label: '毎週' },
]

export type AdminTask = {
  id: string
  clubId: string
  title: string
  subject: string
  startsOn: string // YYYY-MM-DD
  dueOn: string | null
  recurrence: Recurrence
  estimatedMinutes: number | null
  archivedAt: string | null
}

export type TaskStatus = 'active' | 'scheduled' | 'ended'
export const STATUS_LABEL: Record<TaskStatus, string> = { active: '配信中', scheduled: '予定', ended: '終了' }

/** 配信中・予定・終了。取り下げたもの、期限を過ぎたもの、「なし」で開始日を過ぎたものは終了 */
export function taskStatus(t: AdminTask, today: string): TaskStatus {
  if (t.archivedAt) return 'ended'
  if (t.startsOn > today) return 'scheduled'
  if (t.dueOn !== null && t.dueOn < today) return 'ended'
  if (t.recurrence === 'none' && t.dueOn === null && t.startsOn < today) return 'ended'
  return 'active'
}

function isoDow(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return w === 0 ? 7 : w
}

/** 今日の分として生徒に出るか（配信中のうち、曜日の条件に合う日） */
export function dueToday(t: AdminTask, today: string): boolean {
  if (taskStatus(t, today) !== 'active') return false
  switch (t.recurrence) {
    case 'weekdays':
      return isoDow(today) <= 5
    case 'weekly':
      return isoDow(today) === isoDow(t.startsOn)
    default:
      return true
  }
}

const md = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}月${d}日`
}

export function periodLabel(t: Pick<AdminTask, 'startsOn' | 'dueOn' | 'recurrence'>): string {
  if (t.dueOn && t.dueOn !== t.startsOn) return `${md(t.startsOn)}〜${md(t.dueOn)}`
  if (t.dueOn || t.recurrence === 'none') return `${md(t.startsOn)}のみ`
  return `${md(t.startsOn)}から`
}

export function recurrenceLabel(t: Pick<AdminTask, 'recurrence' | 'startsOn'>): string {
  const w = '日月火水木金土'[new Date(`${t.startsOn}T00:00:00Z`).getUTCDay()]
  switch (t.recurrence) {
    case 'none': return 'なし'
    case 'daily': return '毎日'
    case 'weekdays': return '平日（月〜金）'
    case 'weekly': return `毎週${w}曜日`
  }
}

/** 今日の完了：完了した人数 / 承認済みの生徒数。曜日の条件に合わない日は出さない */
export function completionLabel(done: number, students: number, due: boolean): string {
  if (!due) return '今日は配信なし'
  if (students === 0) return '承認済みの生徒がいません'
  return `${done} / ${students} 人`
}

export type Draft = {
  title: string
  subject: string
  startsOn: string
  dueOn: string
  recurrence: Recurrence
  minutes: string
  /** true なら、すべてのクラブに配信する */
  allClubs: boolean
}

export function emptyDraft(today: string): Draft {
  return { title: '', subject: '', startsOn: today, dueOn: '', recurrence: 'none', minutes: '', allClubs: false }
}

export type DraftErrors = Partial<Record<'title' | 'subject' | 'startsOn' | 'dueOn' | 'minutes', string>>

export function validateDraft(d: Draft, today: string): DraftErrors {
  const e: DraftErrors = {}
  const title = d.title.trim()
  if (title.length === 0) e.title = 'タスクの名前を入力してください'
  else if (title.length > 60) e.title = 'タスクの名前は60文字までです'
  if (!(SUBJECTS as readonly string[]).includes(d.subject)) e.subject = '教科を選んでください'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startsOn)) e.startsOn = '開始日を入力してください'
  else if (d.startsOn < today) e.startsOn = '開始日は、今日以降にしてください'
  if (d.dueOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dueOn)) e.dueOn = '期限日の形式が正しくありません'
    else if (!e.startsOn && d.dueOn < d.startsOn) e.dueOn = '期限日は、開始日以降にしてください'
  }
  if (d.minutes.trim() !== '') {
    const n = Number(d.minutes)
    if (!Number.isInteger(n) || n < 1 || n > 600) e.minutes = '目安時間は、1〜600の整数で入力してください'
  }
  return e
}

export function hasErrors(e: DraftErrors): boolean {
  return Object.keys(e).length > 0
}

/** 並び：配信中は新しい順、予定は開始日が近い順、終了は新しく終わった順 */
export function groupTasks(tasks: ReadonlyArray<AdminTask>, today: string): Record<TaskStatus, AdminTask[]> {
  const g: Record<TaskStatus, AdminTask[]> = { active: [], scheduled: [], ended: [] }
  for (const t of tasks) g[taskStatus(t, today)].push(t)
  g.active.sort((a, b) => b.startsOn.localeCompare(a.startsOn))
  g.scheduled.sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  g.ended.sort((a, b) => (b.dueOn ?? b.startsOn).localeCompare(a.dueOn ?? a.startsOn))
  return g
}
