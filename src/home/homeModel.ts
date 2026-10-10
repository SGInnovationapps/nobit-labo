// ホーム（01）と完了シート（02）の表示ロジック。画面にも通信にも依存しない純粋な関数。

export type HomeTask = {
  id: string
  title: string
  subject: string
  estimatedMinutes: number | null
  isFree: boolean
  completedAt: string | null
}

export type BandCell =
  | { kind: 'none'; date: string; today: boolean }
  | { kind: 'rest'; date: string; today: boolean }
  | { kind: 'done'; date: string; today: boolean; level: 1 | 2 | 3; count: number }

export type DayState = 'all' | 'partial' | 'none' | 'empty'

const DAY_MS = 86_400_000

/** 日本時間（JST）の日付 YYYY-MM-DD */
export function jstDate(now: Date | string | number): string {
  const t = new Date(now).getTime() + 9 * 3_600_000
  return new Date(t).toISOString().slice(0, 10)
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10)
}

/** 完了時刻の表示（JST の 17:05 の形） */
export function timeLabel(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString()
  return t.slice(11, 16)
}

/** 完了数 → 棒の段階。1 / 2 / 3 件以上 */
export function levelOf(count: number): 1 | 2 | 3 | null {
  if (count <= 0) return null
  if (count === 1) return 1
  if (count === 2) return 2
  return 3
}

/** 記録の帯：今日を右端にした直近 days 日。記録のない日は空白 */
export function buildBand(
  activity: ReadonlyArray<{ date: string; count: number }>,
  today: string,
  days = 30,
  restDates: ReadonlyArray<string> = [],
): BandCell[] {
  const counts = new Map(activity.map((a) => [a.date, a.count]))
  const rests = new Set(restDates)
  const cells: BandCell[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const isToday = date === today
    const level = levelOf(counts.get(date) ?? 0)
    if (level) cells.push({ kind: 'done', date, today: isToday, level, count: counts.get(date) ?? 0 })
    else if (rests.has(date)) cells.push({ kind: 'rest', date, today: isToday })
    else cells.push({ kind: 'none', date, today: isToday })
  }
  return cells
}

/** 未完了を上、完了は下（完了が早い順）。同じ状態の中では配信タスクを先に */
export function sortTasks(tasks: ReadonlyArray<HomeTask>): HomeTask[] {
  return [...tasks].sort((a, b) => {
    if (!!a.completedAt !== !!b.completedAt) return a.completedAt ? 1 : -1
    if (a.completedAt && b.completedAt) return a.completedAt.localeCompare(b.completedAt)
    if (a.isFree !== b.isFree) return a.isFree ? 1 : -1
    return 0
  })
}

export function dayState(tasks: ReadonlyArray<HomeTask>): DayState {
  if (tasks.length === 0) return 'empty'
  const done = tasks.filter((t) => t.completedAt).length
  if (done === tasks.length) return 'all'
  return done === 0 ? 'none' : 'partial'
}

/** 状態は色だけでなく文字でも示す */
export const STATE_LABEL: Record<DayState, string> = {
  all: 'すべて完了',
  partial: '一部完了',
  none: '未着手',
  empty: 'タスクなし',
}

/** ホームのノビットの一文（画像なし）。できなかった日を責めない */
export function cheerOf(tasks: ReadonlyArray<HomeTask>): string {
  const state = dayState(tasks)
  const rest = tasks.filter((t) => !t.completedAt).length
  switch (state) {
    case 'all':
      return '今日の分は、ぜんぶ記録できたね。'
    case 'partial':
      return `あと${rest}件。できるところから。`
    case 'none':
      return '今日も、ひとつ育てよう。'
    case 'empty':
      return '自分で決めた勉強を、ひとつ記録してみよう。'
  }
}

/** 記録の帯の読み上げ・代替テキスト */
export function bandSummary(cells: ReadonlyArray<BandCell>): string {
  const days = cells.filter((c) => c.kind === 'done').length
  return `直近${cells.length}日のうち、記録した日は${days}日`
}

export function dateLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  const w = '日月火水木金土'[new Date(`${date}T00:00:00Z`).getUTCDay()]
  return `${m}月${d}日（${w}）`
}

export const SUBJECTS = ['英語', '数学', '国語', '理科', '社会'] as const

/** 今月（JST）に学習を記録した日数。タスク完了・教科タグ・タイマーのどれでも 1 日と数える */
export function monthStudyDays(activity: ReadonlyArray<{ date: string; count: number }>, today: string): number {
  const month = today.slice(0, 7)
  return activity.filter((a) => a.date.startsWith(month) && a.date <= today && a.count > 0).length
}

/** タイマーの経過時間の表示。1 時間未満は 12:05、以上は 1:02:05 */
export function elapsedLabel(startedAt: string, now: number): string {
  const total = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** 経過した分数（切り捨て）。終了し忘れを直すときの上限 */
export function elapsedMinutes(startedAt: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000))
}

/** 終了し忘れの修正：学習した分数の検証。経過時間より長くはできない */
export function validateMinutes(raw: string, max: number): { ok: true; value: number } | { ok: false; message: string } {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) return { ok: false, message: '分数を数字で入力してください' }
  const value = Number(text)
  if (value > max) return { ok: false, message: `経過時間（${max}分）より長くはできません` }
  return { ok: true, value }
}

/** 記録したときの一言。コインが付かなかったときは出さない */
export function coinNote(coins: number): string {
  return coins > 0 ? `＋${coins}コイン` : ''
}

/** タイマー開始前の内容の検証（任意。書くなら 60 文字まで） */
export function validateContent(raw: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const value = raw.trim()
  if (value === '') return { ok: true, value: null }
  if ([...value].length > 60) return { ok: false, message: '内容は60文字までです' }
  return { ok: true, value }
}

/** 集中モードの目標（15 分）。1 分 = 1 目盛りの 15 目盛り */
export const FOCUS_SECONDS = 15 * 60

export type FocusProgress = {
  /** 一時停止を除いた、集中した秒数（目標まで） */
  activeSeconds: number
  remainingSeconds: number
  /** 残り時間の表示（例：12:05） */
  label: string
  /** 経過した目盛りの数（0〜15） */
  ticks: number
  reached: boolean
  paused: boolean
}

/** 集中モードの進み具合。停止中は止めた時点で固定する */
export function focusProgress(
  f: { startedAt: string; pausedAt: string | null; pausedSeconds: number; targetSeconds: number },
  now: number,
): FocusProgress {
  const end = f.pausedAt ? new Date(f.pausedAt).getTime() : now
  const raw = Math.floor((end - new Date(f.startedAt).getTime()) / 1000) - f.pausedSeconds
  const activeSeconds = Math.min(f.targetSeconds, Math.max(0, raw))
  const remainingSeconds = f.targetSeconds - activeSeconds
  const m = Math.floor(remainingSeconds / 60)
  const sec = remainingSeconds % 60
  return {
    activeSeconds,
    remainingSeconds,
    label: `${m}:${String(sec).padStart(2, '0')}`,
    ticks: Math.min(15, Math.floor(activeSeconds / 60)),
    reached: remainingSeconds === 0,
    paused: f.pausedAt !== null,
  }
}

/** 集中モードを終えたときの案内 */
export function focusNote(r: { focusAchieved: boolean; focusBonus: number; coinsGranted: number; durationSeconds: number | null }): string {
  if (r.focusAchieved) {
    const coins = r.focusBonus + r.coinsGranted
    return `15分集中を達成しました　${coinNote(coins)}`.trim()
  }
  const min = Math.floor((r.durationSeconds ?? 0) / 60)
  return `${min}分の集中を記録しました　${coinNote(r.coinsGranted)}`.trim()
}
