import { supabase } from '../lib/supabase'
import { jstDate } from './homeModel'
import { addDays } from './homeModel'
import { streakTrend } from './reflectModel'
import type { Period, TrendPoint } from './reflectModel'
import type { WeekHistoryRow } from './weekModel'

export type ReflectData = {
  today: string
  streak: { current: number; longest: number }
  activity: { date: string; count: number }[]
  restDates: string[]
  tasks: { subject: string }[]
  records: { subject: string; kind: 'tag' | 'timer'; durationSeconds: number | null }[]
  /** 連続記録の推移（直近12週） */
  trend: TrendPoint[]
  /** 休息チケット。読めなかったときは null */
  tickets: { balance: number; usedInPeriod: number } | null
  /** デイリークエストの達成履歴（日ごと） */
  quests: { date: string; keys: string[]; coins: number }[]
  /** 週の目標とウィークリークエストの履歴（期間にかかる週） */
  weeks: WeekHistoryRow[]
}

type TaskRow = { tasks: { subject: string } | { subject: string }[] | null }

/** 期間の記録をまとめて読む。教科・内容は本人だけが読める（RLS） */
export async function loadReflect(period: Period): Promise<ReflectData> {
  const today = jstDate(Date.now())
  const trendFrom = addDays(today, -400)
  const [streakRes, activityRes, tasksRes, recordsRes, eventRes, usesRes, histActRes, histEvtRes, histUseRes, ticketRes, questRes, weekRes] = await Promise.all([
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
    supabase.from('daily_activity').select('activity_date, completed_count').gte('activity_date', trendFrom).lte('activity_date', today),
    supabase.from('club_events').select('event_date').gte('event_date', trendFrom).lte('event_date', today),
    supabase.from('rest_ticket_uses').select('rest_date').gte('rest_date', trendFrom).lte('rest_date', today),
    supabase.rpc('my_rest_tickets'),
    supabase.rpc('my_quest_history', { p_from: period.from, p_to: period.to }),
    supabase.rpc('my_weekly_history', { p_from: period.from, p_to: period.to }),
  ])
  if (eventRes.error) throw eventRes.error
  if (streakRes.error) throw streakRes.error
  if (activityRes.error) throw activityRes.error
  if (tasksRes.error) throw tasksRes.error
  if (recordsRes.error) throw recordsRes.error
  if (histActRes.error) throw histActRes.error
  if (histEvtRes.error) throw histEvtRes.error
  if (histUseRes.error) throw histUseRes.error

  return {
    today,
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
    trend: streakTrend(
      (histActRes.data ?? []).map((a) => ({ date: a.activity_date as string, count: a.completed_count as number })),
      [...(histEvtRes.data ?? []).map((e) => e.event_date as string), ...(histUseRes.data ?? []).map((u) => u.rest_date as string)],
      today,
    ),
    tickets: ticketRes.error || !ticketRes.data ? null : { balance: ((ticketRes.data as Record<string, unknown>).balance as number) ?? 0, usedInPeriod: (usesRes.data ?? []).length },
    quests: questRes.error ? [] : ((questRes.data as Array<Record<string, unknown>> | null) ?? []).map((q) => ({
      date: String(q.quest_date),
      keys: Array.isArray(q.keys) ? q.keys.map((k) => String(k)) : [],
      coins: Number(q.coins ?? 0),
    })),
    weeks: weekRes.error ? [] : ((weekRes.data as Array<Record<string, unknown>> | null) ?? []).map((w) => ({
      weekStart: String(w.week_start),
      targetDays: Number(w.target_days ?? 0),
      studyDays: Number(w.study_days ?? 0),
      goalAchieved: w.goal_achieved === true,
      subjectQuestSubject: typeof w.subject_quest_subject === 'string' ? w.subject_quest_subject : null,
    })),
  }
}
