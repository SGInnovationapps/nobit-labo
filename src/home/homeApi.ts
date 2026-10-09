import { supabase } from '../lib/supabase'
import type { HomeTask } from './homeModel'
import { addDays, jstDate } from './homeModel'

export type HomeData = {
  today: string
  tasks: HomeTask[]
  streak: { current: number; longest: number }
  activity: { date: string; count: number }[]
  allowFreeTasks: boolean
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

  const [tasksRes, streakRes, activityRes, clubRes, supportRes] = await Promise.all([
    supabase
      .from('user_tasks')
      .select('id, completed_at, tasks(title, subject, estimated_minutes, kind)')
      .eq('task_date', today)
      .order('created_at', { ascending: true }),
    supabase.from('streak_status').select('current_days, longest_days').maybeSingle(),
    supabase
      .from('daily_activity')
      .select('activity_date, completed_count')
      .gte('activity_date', addDays(today, -29))
      .lte('activity_date', today),
    supabase.from('clubs').select('allow_free_tasks').eq('id', clubId).maybeSingle(),
    supabase.from('support_comments').select('body, created_at').order('created_at', { ascending: false }).limit(1),
  ])
  if (tasksRes.error) throw tasksRes.error
  if (streakRes.error) throw streakRes.error
  if (activityRes.error) throw activityRes.error

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
