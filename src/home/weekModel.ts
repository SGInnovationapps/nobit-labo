// 週の学習目標とウィークリークエスト（バッチ13）
// 週は月〜日（JST）。目標は本人が3〜7日から選ぶ。達成した週は、ごほうびのガチャを1回引ける

// 画面にも通信にも依存しない純粋な関数（node のテストから直接読むため、他のモデルも import しない）
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10)
}

export const WEEK_TARGET_OPTIONS = [3, 4, 5, 6, 7] as const
export const WEEK_TARGET_DEFAULT = 5
export const WEEKLY_QUEST_DAYS = 3
export const WEEKLY_QUEST_COINS = 10

export type WeekInfo = {
  weekStart: string
  today: string
  targetDays: number
  /** 来週からの目標（変えたばかりなら今週と違う） */
  nextTargetDays: number
  /** 今週、学習した日（休息日は入らない） */
  studyDates: string[]
  goalAchieved: boolean
  /** ごほうびのガチャが残っているか（今週か先週の分） */
  rewardAvailable: boolean
  rewardWeek: string | null
  subjectQuest: {
    bestSubject: string | null
    bestDays: number
    achieved: boolean
    achievedSubject: string | null
    coins: number
  }
}

/** 記録の結果に付く、今回あらたに達成したもの */
export type NewWeek = {
  goal: { targetDays: number; days: number } | null
  subjectQuest: { subject: string; coins: number } | null
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function clampTarget(v: unknown): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= 3 && n <= 7 ? n : WEEK_TARGET_DEFAULT
}

/** my_week の結果を読む。形がおかしければ null（パネルを出さない） */
export function parseWeek(raw: unknown): WeekInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isDate(r.week_start) || !isDate(r.today)) return null
  const q = (r.subject_quest && typeof r.subject_quest === 'object' ? r.subject_quest : {}) as Record<string, unknown>
  return {
    weekStart: r.week_start,
    today: r.today,
    targetDays: clampTarget(r.target_days),
    nextTargetDays: clampTarget(r.next_target_days ?? r.target_days),
    studyDates: Array.isArray(r.study_dates) ? r.study_dates.filter(isDate) : [],
    goalAchieved: r.goal_achieved === true,
    rewardAvailable: r.reward_available === true,
    rewardWeek: isDate(r.reward_week) ? r.reward_week : null,
    subjectQuest: {
      bestSubject: typeof q.best_subject === 'string' ? q.best_subject : null,
      bestDays: Number(q.best_days ?? 0) || 0,
      achieved: q.achieved === true,
      achievedSubject: typeof q.achieved_subject === 'string' ? q.achieved_subject : null,
      coins: Number(q.coins ?? 0) || 0,
    },
  }
}

export function parseNewWeek(raw: unknown): NewWeek {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const g = r.goal as Record<string, unknown> | undefined
  const s = r.subject_quest as Record<string, unknown> | undefined
  return {
    goal: g && typeof g === 'object' ? { targetDays: Number(g.target_days ?? 0), days: Number(g.days ?? 0) } : null,
    subjectQuest: s && typeof s === 'object' && typeof s.subject === 'string'
      ? { subject: s.subject, coins: Number(s.coins ?? 0) }
      : null,
  }
}

/** 今日をふくめて、今週あと何日あるか（月曜なら7、日曜なら1） */
export function daysLeftInWeek(weekStart: string, today: string): number {
  for (let i = 0; i < 7; i++) if (addDays(weekStart, i) === today) return 7 - i
  return 0
}

/** 今週の目標の下の一文。届かない週でも責めない */
export function weekGoalNote(w: WeekInfo): string {
  const days = w.studyDates.length
  if (w.goalAchieved) {
    return w.rewardAvailable && w.rewardWeek === w.weekStart
      ? '今週の目標を達成。ごほうびのガチャを1回引けます。'
      : '今週の目標を達成しました。'
  }
  const remaining = Math.max(0, w.targetDays - days)
  // 今日がまだ記録前なら、今日も数に入る
  const left = daysLeftInWeek(w.weekStart, w.today) - (w.studyDates.includes(w.today) ? 1 : 0)
  if (remaining > left) return '今週は、できる日に記録しよう。来週また目標に向かえます。'
  return `あと${remaining}日で、ごほうびのガチャ1回。`
}

/** 先週のごほうびが残っているとき（今週の日曜まで引ける） */
export function previousRewardNote(w: WeekInfo): string | null {
  if (!w.rewardAvailable || !w.rewardWeek || w.rewardWeek >= w.weekStart) return null
  return '先週のごほうびのガチャが残っています。今週の日曜まで引けます。'
}

/** 「同じ教科を週3日」の進み */
export function subjectQuestProgress(w: WeekInfo): { label: string; done: boolean; days: number } {
  const q = w.subjectQuest
  if (q.achieved) return { label: `${q.achievedSubject ?? ''}`, done: true, days: WEEKLY_QUEST_DAYS }
  const days = Math.min(q.bestDays, WEEKLY_QUEST_DAYS)
  return { label: q.bestSubject && days > 0 ? q.bestSubject : '', done: false, days }
}

/** 目標を変えたあとの一文 */
export function targetChangedNote(days: number, appliesFrom: 'this_week' | 'next_week'): string {
  return appliesFrom === 'this_week' ? `今週の目標を${days}日にしました。` : `来週から、目標を${days}日にします。`
}

/** 記録したときに出す一文（今回あらたに達成したものだけ） */
export function newWeekNote(w: NewWeek): string {
  const parts: string[] = []
  if (w.goal) parts.push('週の目標を達成　ごほうびのガチャ1回')
  if (w.subjectQuest) {
    parts.push(`ウィークリー達成「${w.subjectQuest.subject}を週${WEEKLY_QUEST_DAYS}日」${w.subjectQuest.coins > 0 ? `　＋${w.subjectQuest.coins}コイン` : ''}`)
  }
  return parts.join('　')
}

export type WeekHistoryRow = {
  weekStart: string
  targetDays: number
  studyDays: number
  goalAchieved: boolean
  subjectQuestSubject: string | null
}

/** 週の見出し（例：10/5〜10/11） */
export function weekRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, 6)
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  return `${md(weekStart)}〜${md(end)}`
}

export function weekHistorySummary(rows: ReadonlyArray<WeekHistoryRow>): { weeks: number; achieved: number; subjectQuests: number } {
  return {
    weeks: rows.length,
    achieved: rows.filter((r) => r.goalAchieved).length,
    subjectQuests: rows.filter((r) => r.subjectQuestSubject !== null).length,
  }
}
