import { supabase } from '../lib/supabase'
import { jstDate } from './homeModel'
import type { Period } from './reflectModel'

export type ReflectData = {
  today: string
  streak: { current: number; longest: number }
  activity: { date: string; count: number }[]
  restDates: string[]
  tasks: { subject: string }[]
  records: { subject: string; kind: 'tag' | 'timer'; durationSeconds: number | null }[]
}

type TaskRow = { tasks: { subject: string } | { subject: string }[] | null }

/** 期間の記録をまとめて読む。教科・内容は本人だけが読める（RLS） */
export async function loadReflect(period: Period): Promise<ReflectData> {
  const [streakRes, activityRes, tasksRes, recordsRes, eventRes, usesRes] = await Promise.all([
    supabase.from('streak_status').select('current_days, longest_days').maybeSingle(),
    supabase.from('daily_activity').select('activity_date, completed_count').gte('activity_date', period.from).lte('activity_date', period.to),
    supabase
      .from('user_tasks')
      .select('tasks(subject)')
      .not('completed_at', 'is', null)
      .gte('task_date', period.from)
      .lte('task_date', period.to),
    supabase
      .from('study_records')
      .select('subject, kind, duration_seconds')
      .not('ended_at', 'is', null)
      .gte('record_date', period.from)
      .lte('record_date', period.to),
    supabase.from('club_events').select('event_date').gte('event_date', period.from).lte('event_date', period.to),
    supabase.from('rest_ticket_uses').select('rest_date').gte('rest_date', period.from).lte('rest_date', period.to),
  ])
  if (eventRes.error) throw eventRes.error
  if (streakRes.error) throw streakRes.error
  if (activityRes.error) throw activityRes.error
  if (tasksRes.error) throw tasksRes.error
  if (recordsRes.error) throw recordsRes.error

  return {
    today: jstDate(Date.now()),
    streak: { current: streakRes.data?.current_days ?? 0, longest: streakRes.data?.longest_days ?? 0 },
    activity: (activityRes.data ?? []).map((a) => ({ date: a.activity_date as string, count: a.completed_count as number })),
    restDates: [...(eventRes.data ?? []).map((e) => e.event_date as string), ...(usesRes.data ?? []).map((u) => u.rest_date as string)],
    tasks: ((tasksRes.data ?? []) as unknown as TaskRow[]).flatMap((r) => {
      const t = Array.isArray(r.tasks) ? r.tasks[0] : r.tasks
      return t ? [{ subject: t.subject }] : []
    }),
    records: (recordsRes.data ?? []).map((r) => ({
      subject: r.subject as string,
      kind: r.kind as 'tag' | 'timer',
      durationSeconds: (r.duration_seconds as number | null) ?? null,
    })),
  }
}
