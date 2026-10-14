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

/** 学年の表示（7＝中1 … 12＝高3）。lib/steps の GRADES と同じ。Node のテストから直接読めるよう、ここに持つ */
export const TASK_GRADES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 7, label: '中1' }, { value: 8, label: '中2' }, { value: 9, label: '中3' },
  { value: 10, label: '高1' }, { value: 11, label: '高2' }, { value: 12, label: '高3' },
]

/** ［仮］配信タスクの標準の報酬コイン（仕様書 5-5） */
export const ASSIGNED_TASK_COINS = 10
export const TASK_COINS_MAX = 100

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
  /** 配信する学年（7＝中1 … 12＝高3）。null は全学年 */
  targetGrades?: number[] | null
  rewardCoins?: number
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
  /** 配信するクラブ（複数選べる） */
  clubIds: string[]
  /** 配信する学年。空は全学年 */
  grades: number[]
  /** 報酬のコイン（文字のまま持つ） */
  coins: string
}

export function emptyDraft(today: string, clubIds: string[] = []): Draft {
  return { title: '', subject: '', startsOn: today, dueOn: '', recurrence: 'none', minutes: '', clubIds, grades: [], coins: String(ASSIGNED_TASK_COINS) }
}

/** ［仮］v1.7：既存のタスクを複製する。開始日は今日、期限日は空にする（名前・教科・目安・くり返し・学年・報酬は引き継ぐ） */
export function draftFromTask(t: AdminTask, today: string, clubIds: string[]): Draft {
  return {
    title: t.title,
    subject: t.subject,
    startsOn: today,
    dueOn: '',
    recurrence: t.recurrence,
    minutes: t.estimatedMinutes === null ? '' : String(t.estimatedMinutes),
    clubIds,
    grades: [...(t.targetGrades ?? [])].sort((a, b) => a - b),
    coins: String(t.rewardCoins ?? ASSIGNED_TASK_COINS),
  }
}

/** 学年の選びなおし。すでに選んでいれば外し、なければ足す（小さい順） */
export function toggleGrade(grades: ReadonlyArray<number>, grade: number): number[] {
  return grades.includes(grade) ? grades.filter((g) => g !== grade) : [...grades, grade].sort((a, b) => a - b)
}

/** 対象の学年の表示。全学年／中1・中2 */
export function gradesLabel(grades: ReadonlyArray<number> | null | undefined): string {
  if (!grades || grades.length === 0 || grades.length === TASK_GRADES.length) return '全学年'
  return [...grades].sort((a, b) => a - b).map((g) => TASK_GRADES.find((x) => x.value === g)?.label ?? '').join('・')
}

/** 今日の完了率の分母：学年の対象に入る、承認済みの生徒の数 */
export function eligibleStudents(t: Pick<AdminTask, 'targetGrades'>, studentGrades: ReadonlyArray<number | null>): number {
  if (!t.targetGrades || t.targetGrades.length === 0) return studentGrades.length
  return studentGrades.filter((g) => g !== null && t.targetGrades!.includes(g)).length
}

export type DraftErrors = Partial<Record<'title' | 'subject' | 'startsOn' | 'dueOn' | 'minutes' | 'clubs' | 'coins', string>>

/** needClubs：クラブを選ぶ画面（複数クラブの運営）のときだけ、1つ以上の選択を求める */
export function validateDraft(d: Draft, today: string, needClubs = false): DraftErrors {
  const e: DraftErrors = {}
  if (needClubs && d.clubIds.length === 0) e.clubs = '配信するクラブを1つ以上選んでください'
  if (d.coins.trim() !== '') {
    const c = Number(d.coins)
    if (!Number.isInteger(c) || c < 0 || c > TASK_COINS_MAX) e.coins = `報酬のコインは、0〜${TASK_COINS_MAX}の整数で入力してください`
  }
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
