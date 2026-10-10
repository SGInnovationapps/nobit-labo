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

/** 連続記録が途切れたあとの再開画面（08）を出すか。途切れごとに 1 回（最後の達成日で区別する） */
export function needsResume(currentDays: number, lastDate: string | null, seenFor: string | null): boolean {
  return currentDays === 0 && lastDate !== null && seenFor !== lastDate
}

/** 再開画面に出す今日のタスク：未完了を、短い見込み時間から（見込みなしは後ろ） */
export function shortFirst(tasks: ReadonlyArray<HomeTask>, limit = 3): HomeTask[] {
  return tasks
    .filter((t) => !t.completedAt)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.estimatedMinutes ?? Infinity) - (b.t.estimatedMinutes ?? Infinity) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.t)
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

/** v1.7［仮］：全面のシート（02）を出すのは、その日の最初の記録・連続記録の節目のときだけ。2件目以降は行に時刻が入るだけ */
export function shouldShowSheet(r: { firstOfDay: boolean; milestone: boolean }): boolean {
  return r.firstOfDay || r.milestone
}

/** 全面のシートの見出し */
export function sheetLabel(r: { firstOfDay: boolean; milestone: boolean; currentDays: number }): string {
  if (r.milestone) return `連続記録 ${r.currentDays}日`
  return r.firstOfDay ? '今日の最初の記録' : '記録しました'
}

export type TagRecord = { id: string; subject: string; recordedAt: string }

/** 教科ボタンに出す、今日すでに記録した時刻（同じ教科は1日1回） */
export function recordedTime(tags: ReadonlyArray<TagRecord>, subject: string): string | null {
  const t = tags.find((x) => x.subject === subject)
  return t ? timeLabel(t.recordedAt) : null
}


// ---- v1.7 ④：デイリークエストと休息チケット ----

export const QUEST_MINUTES = 15
export const QUEST_SUBJECTS = 2

export type Quest = { key: 'assigned' | 'minutes' | 'subjects'; label: string; done: boolean; progress: string }

/**
 * デイリークエスト［仮］：配信タスク1つ・合計15分・2教科。コインは付けない（表示だけ）。
 * 今日の配信タスクがないときは、その項目を出さない（分母に入れない）。
 */
export function questsOf(input: {
  tasks: ReadonlyArray<HomeTask>
  tags: ReadonlyArray<TagRecord>
  /** 今日、終えたタイマーの合計秒数 */
  timerSeconds: number
  /** 今日、タイマーで記録した教科 */
  timerSubjects: ReadonlyArray<string>
}): Quest[] {
  const out: Quest[] = []
  const assigned = input.tasks.filter((t) => !t.isFree)
  if (assigned.length > 0) {
    const n = assigned.filter((t) => t.completedAt).length
    out.push({ key: 'assigned', label: '配信タスクを1つ完了', done: n >= 1, progress: `${Math.min(n, 1)} / 1` })
  }
  const minutes = Math.floor(input.timerSeconds / 60)
  out.push({ key: 'minutes', label: `合計${QUEST_MINUTES}分、学習する`, done: minutes >= QUEST_MINUTES, progress: `${Math.min(minutes, QUEST_MINUTES)} / ${QUEST_MINUTES}分` })
  const subjects = new Set<string>([
    ...input.tasks.filter((t) => t.completedAt).map((t) => t.subject),
    ...input.tags.map((t) => t.subject),
    ...input.timerSubjects,
  ])
  out.push({ key: 'subjects', label: `${QUEST_SUBJECTS}教科を記録`, done: subjects.size >= QUEST_SUBJECTS, progress: `${Math.min(subjects.size, QUEST_SUBJECTS)} / ${QUEST_SUBJECTS}` })
  return out
}

export function questSummary(quests: ReadonlyArray<Quest>): string {
  return `${quests.filter((q) => q.done).length} / ${quests.length}`
}

export type TicketInfo = {
  balance: number
  /** 次に1枚付く日（月曜） */
  nextGrantOn: string
  canProtectToday: boolean
  canProtectYesterday: boolean
}

/** 休息チケットの使いみちを一文で。使えるときだけ、使える日を返す */
export function ticketNote(t: TicketInfo): string {
  if (t.balance === 0) return `次の1枚は ${dateLabel(t.nextGrantOn)} に付きます。`
  if (t.canProtectYesterday) return '昨日を休息日にして、連続記録を戻せます。学習日には数えません。'
  if (t.canProtectToday) return '今日を休息日にして、連続記録を守れます。学習日には数えません。'
  return '連続記録が途切れそうなときに使えます。毎週月曜に1枚、2枚までためられます。'
}

export function ticketErrorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  if (text.includes('no_ticket')) return '休息チケットがありません。'
  if (text.includes('cannot_protect')) return 'この日は、チケットを使っても連続記録がつながりません。'
  if (text.includes('date_not_allowed')) return '使えるのは、今日と昨日だけです。'
  return '使えませんでした。通信を確認して、もう一度お試しください。'
}


// ---- v1.7 新ホーム：5つの状態 ----

export type HomeState = 'first' | 'notyet' | 'recording' | 'done' | 'resume'

/**
 * ホームの状態。
 * 再開 … 連続記録が途切れたあとの最初の起動で、今日まだ記録がない
 * はじめて … まだ一度も学習の記録がない
 * 今日まだ … 今日の記録が0件
 * 記録中 … 今日の記録が1件以上あり、配信タスクが残っている（配信がない日を含む）
 * タスク完了 … 今日の配信タスクがすべて完了
 */
export function homeStateOf(input: {
  todayCount: number
  studyDaysTotal: number
  tasks: ReadonlyArray<HomeTask>
  resume: boolean
}): HomeState {
  if (input.todayCount === 0) {
    if (input.resume) return 'resume'
    if (input.studyDaysTotal === 0) return 'first'
    return 'notyet'
  }
  const assigned = input.tasks.filter((t) => !t.isFree)
  if (assigned.length > 0 && assigned.every((t) => t.completedAt)) return 'done'
  return 'recording'
}

/** ノビットの一文（画像なし）。再開の状態は画像で出すので一文は置かない */
export function stateCheer(state: HomeState, todayCount: number): string | null {
  switch (state) {
    case 'first': return '最初の1件を残そう。'
    case 'notyet': return '今日のページは、まだこれから。'
    case 'recording': return `今日の自分、${todayCount}件すすんだ。`
    case 'done': return 'よくがんばったね。'
    case 'resume': return null
  }
}

export type TodayRecord = { key: string; at: string; name: string; kind: 'タスク' | '教科' | 'タイマー'; minutes: number | null }

export type TimerRecord = { id: string; subject: string; content: string | null; endedAt: string; seconds: number; taskLinked: boolean }

/**
 * 今日の記録の一覧（新しい順）。タスクから始めたタイマーは、タスクの行に時刻が入るので、別の行にしない
 * （記録の数え方と同じ：タスクの完了で1件）
 */
export function todayRecords(input: {
  tasks: ReadonlyArray<HomeTask>
  tags: ReadonlyArray<TagRecord>
  timers: ReadonlyArray<TimerRecord>
}): TodayRecord[] {
  const out: TodayRecord[] = []
  for (const t of input.tasks) if (t.completedAt) out.push({ key: `t:${t.id}`, at: t.completedAt, name: t.title, kind: 'タスク', minutes: null })
  for (const g of input.tags) out.push({ key: `g:${g.id}`, at: g.recordedAt, name: g.subject, kind: '教科', minutes: null })
  for (const m of input.timers) {
    if (m.taskLinked) continue
    out.push({ key: `m:${m.id}`, at: m.endedAt, name: m.content ? `${m.subject}　${m.content}` : m.subject, kind: 'タイマー', minutes: Math.max(1, Math.round(m.seconds / 60)) })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** 連続日数の次の節目（7・30・100・365日）。称号・バッジの仕組みができるまでの［仮］ */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const

export function nextMilestone(current: number): { target: number; remaining: number; ratio: number } | null {
  const target = STREAK_MILESTONES.find((m) => m > current)
  if (!target) return null
  return { target, remaining: target - current, ratio: current / target }
}

/** 応援は、新しく届いた日（その日のうち）だけ、ノビットの一文の下に出す */
export function isNewSupport(createdAt: string, today: string): boolean {
  return jstDate(createdAt) === today
}

export const BAND_NOTE = '記録がない日も責めない。続けたぶんがここに残る。'

/** 記録の帯の曜日の一文字（日付から） */
export function weekdayChar(date: string): string {
  return '日月火水木金土'[new Date(`${date}T00:00:00Z`).getUTCDay()]
}
