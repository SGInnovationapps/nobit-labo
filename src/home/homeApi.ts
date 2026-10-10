import { supabase } from '../lib/supabase'
import type { HomeTask } from './homeModel'
import { addDays, jstDate } from './homeModel'

export type HomeData = {
  today: string
  tasks: HomeTask[]
  streak: { current: number; longest: number }
  activity: { date: string; count: number }[]
  allowFreeTasks: boolean
  /** コイン残高（台帳の合計） */
  coins: number
  /** 実行中のタイマー（なければ null） */
  timer: {
    id: string; subject: string; content: string | null; startedAt: string
    /** 集中モードのときの目標秒数。通常のタイマーは null */
    focusTargetSeconds: number | null; pausedAt: string | null; pausedSeconds: number
  } | null
  /** クラブの管理者からの、最新の応援コメント */
  support: { body: string; createdAt: string } | null
}

export type CompleteResult = {
  userTaskId: string
  completedAt: string
  alreadyCompleted: boolean
  completedToday: number
  currentDays: number
  longestDays: number
}

type TaskRow = {
  id: string
  completed_at: string | null
  tasks: { title: string; subject: string; estimated_minutes: number | null; kind: string } | { title: string; subject: string; estimated_minutes: number | null; kind: string }[] | null
}

/** ホームに必要なものをまとめて読む。配信タスクの展開と、アプリ起動の記録もここで行う */
export async function loadHome(clubId: string): Promise<HomeData> {
  const today = jstDate(Date.now())

  // 起動記録は学習記録とは別。失敗しても画面は出す
  void supabase.rpc('record_app_open').then(() => undefined, () => undefined)
  const sync = await supabase.rpc('sync_today_tasks')
  if (sync.error) throw sync.error

  const monthStart = `${today.slice(0, 7)}-01`
  const activityFrom = monthStart < addDays(today, -29) ? monthStart : addDays(today, -29)

  const [tasksRes, streakRes, activityRes, clubRes, supportRes, coinRes, timerRes] = await Promise.all([
    supabase
      .from('user_tasks')
      .select('id, completed_at, tasks(title, subject, estimated_minutes, kind)')
      .eq('task_date', today)
      .order('created_at', { ascending: true }),
    supabase.from('streak_status').select('current_days, longest_days').maybeSingle(),
    supabase
      .from('daily_activity')
      .select('activity_date, completed_count')
      .gte('activity_date', activityFrom)
      .lte('activity_date', today),
    supabase.from('clubs').select('allow_free_tasks').eq('id', clubId).maybeSingle(),
    supabase.from('support_comments').select('body, created_at').order('created_at', { ascending: false }).limit(1),
    supabase.from('coin_balances').select('balance').maybeSingle(),
    supabase.from('study_records').select('id, subject, content, started_at, focus_target_seconds, paused_at, paused_seconds').is('ended_at', null).maybeSingle(),
  ])
  if (tasksRes.error) throw tasksRes.error
  if (streakRes.error) throw streakRes.error
  if (activityRes.error) throw activityRes.error
  if (coinRes.error) throw coinRes.error
  if (timerRes.error) throw timerRes.error

  const tasks: HomeTask[] = ((tasksRes.data ?? []) as unknown as TaskRow[]).flatMap((r) => {
    const t = Array.isArray(r.tasks) ? r.tasks[0] : r.tasks
    if (!t) return []
    return [{
      id: r.id,
      title: t.title,
      subject: t.subject,
      estimatedMinutes: t.estimated_minutes,
      isFree: t.kind === 'free',
      completedAt: r.completed_at,
    }]
  })

  return {
    today,
    tasks,
    streak: { current: streakRes.data?.current_days ?? 0, longest: streakRes.data?.longest_days ?? 0 },
    activity: (activityRes.data ?? []).map((a) => ({ date: a.activity_date as string, count: a.completed_count as number })),
    coins: coinRes.data?.balance ?? 0,
    timer: timerRes.data
      ? {
          id: timerRes.data.id as string,
          subject: timerRes.data.subject as string,
          content: (timerRes.data.content as string | null) ?? null,
          startedAt: timerRes.data.started_at as string,
          focusTargetSeconds: (timerRes.data.focus_target_seconds as number | null) ?? null,
          pausedAt: (timerRes.data.paused_at as string | null) ?? null,
          pausedSeconds: (timerRes.data.paused_seconds as number) ?? 0,
        }
      : null,
    allowFreeTasks: clubRes.data?.allow_free_tasks ?? false,
    support: supportRes.data?.[0] ? { body: supportRes.data[0].body as string, createdAt: supportRes.data[0].created_at as string } : null,
  }
}

export async function completeTask(userTaskId: string): Promise<CompleteResult> {
  const { data, error } = await supabase.rpc('complete_task', { p_user_task_id: userTaskId })
  if (error) throw error
  const d = data as Record<string, unknown>
  return {
    userTaskId: d.user_task_id as string,
    completedAt: d.completed_at as string,
    alreadyCompleted: d.already_completed as boolean,
    completedToday: d.completed_today as number,
    currentDays: d.current_days as number,
    longestDays: d.longest_days as number,
  }
}

export class FreeTaskError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export async function registerFreeTask(title: string, subject: string, minutes: number | null): Promise<void> {
  const { error } = await supabase.rpc('register_free_task', {
    p_title: title,
    p_subject: subject,
    p_estimated_minutes: minutes,
  })
  if (error) throw new FreeTaskError(error.message)
}

export type StudyResult = {
  coinsGranted: number; currentDays: number; durationSeconds: number | null
  focusAchieved: boolean; focusBonus: number
}

function toStudyResult(d: Record<string, unknown>): StudyResult {
  return {
    coinsGranted: (d.coins_granted as number) ?? 0,
    currentDays: (d.current_days as number) ?? 0,
    durationSeconds: (d.duration_seconds as number | undefined) ?? null,
    focusAchieved: (d.focus_achieved as boolean | undefined) ?? false,
    focusBonus: (d.focus_bonus as number | undefined) ?? 0,
  }
}

/** 事後に教科をワンタップで記録する */
export async function recordStudyTag(subject: string): Promise<StudyResult> {
  const { data, error } = await supabase.rpc('record_study_tag', { p_subject: subject })
  if (error) throw error
  return toStudyResult(data as Record<string, unknown>)
}

/** 内容（任意）を書いてから、タイマーを始める */
export async function startStudyTimer(subject: string, content: string | null): Promise<void> {
  const { error } = await supabase.rpc('start_study_timer', { p_subject: subject, p_content: content })
  if (error) throw error
}

/** タイマーを終える。minutes は終了し忘れを直すときの学習した分数 */
export async function stopStudyTimer(minutes: number | null): Promise<StudyResult> {
  const { data, error } = await supabase.rpc('stop_study_timer', { p_minutes: minutes })
  if (error) throw error
  return toStudyResult(data as Record<string, unknown>)
}

export async function cancelStudyTimer(): Promise<void> {
  const { error } = await supabase.rpc('cancel_study_timer')
  if (error) throw error
}

/** 15分集中モードを始める */
export async function startFocusSession(subject: string, content: string | null): Promise<void> {
  const { error } = await supabase.rpc('start_focus_session', { p_subject: subject, p_content: content })
  if (error) throw error
}

export async function pauseFocusSession(): Promise<void> {
  const { error } = await supabase.rpc('pause_focus_session')
  if (error) throw error
}

export async function resumeFocusSession(): Promise<void> {
  const { error } = await supabase.rpc('resume_focus_session')
  if (error) throw error
}
