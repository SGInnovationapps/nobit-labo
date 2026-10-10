import { supabase } from '../lib/supabase'
import { generateInviteCode } from './applicants'
import type { Applicant } from './applicants'
import { addDays, jstDate } from '../home/homeModel'
import type { AlertItem } from './alertListModel'
import type { AdminMission, ParsedDraft } from './missionAdminModel'
import type { AlertKind, AlertRule, SendMethod } from './alertsModel'
import type { ClubEvent, EventKind } from './eventsModel'
import type { GapRule, StudentRow } from './studentModel'
import { DEFAULT_GAP_RULE } from './studentModel'
import type { AdminTask, Draft, Recurrence } from './taskModel'

export type Me = {
  userId: string
  role: 'operator' | 'club_admin' | 'student'
  displayName: string | null
}

export type Club = {
  id: string
  name: string
  inviteCode: string
  allowFreeTasks: boolean
}

type ClubRow = { id: string; name: string; invite_code: string; allow_free_tasks: boolean }
const CLUB_COLUMNS = 'id, name, invite_code, allow_free_tasks'
const toClub = (r: ClubRow): Club => ({ id: r.id, name: r.name, inviteCode: r.invite_code, allowFreeTasks: r.allow_free_tasks })

export async function loadMe(): Promise<Me> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('ログイン情報を確認できませんでした')
  const { data, error } = await supabase.from('users').select('role, display_name').eq('id', auth.user.id).maybeSingle()
  if (error) throw error
  // users に行がないメールアドレスは、管理画面の権限がない
  return { userId: auth.user.id, role: (data?.role as Me['role']) ?? 'student', displayName: data?.display_name ?? null }
}

/** RLS により、運営は全クラブ、クラブ管理者は自分のクラブだけが返る */
export async function loadClubs(): Promise<Club[]> {
  const { data, error } = await supabase.from('clubs').select(CLUB_COLUMNS).order('created_at', { ascending: true })
  if (error) throw error
  return (data as ClubRow[]).map(toClub)
}

type ApplicantRow = {
  id: string
  user_id: string
  status: 'pending' | 'approved'
  created_at: string
  reviewed_at: string | null
  users: { display_name: string | null; grade: number | null } | { display_name: string | null; grade: number | null }[] | null
}

export async function loadApplicants(clubId: string): Promise<{ applicants: Applicant[]; latestVersion: number | null }> {
  const [memberRes, consentRes, scopeRes] = await Promise.all([
    supabase
      .from('club_members')
      .select('id, user_id, status, created_at, reviewed_at, users!club_members_user_id_fkey(display_name, grade)')
      .eq('club_id', clubId)
      .eq('member_role', 'student')
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false }),
    supabase.from('parental_consents').select('student_id, scope_version').eq('club_id', clubId),
    supabase.from('consent_scope_versions').select('version').order('version', { ascending: false }).limit(1),
  ])
  if (memberRes.error) throw memberRes.error
  if (consentRes.error) throw consentRes.error
  if (scopeRes.error) throw scopeRes.error

  const consents = new Map<string, number[]>()
  for (const c of consentRes.data) {
    const list = consents.get(c.student_id as string) ?? []
    list.push(c.scope_version as number)
    consents.set(c.student_id as string, list)
  }

  const applicants = (memberRes.data as unknown as ApplicantRow[]).map((r): Applicant => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users
    return {
      membershipId: r.id,
      userId: r.user_id,
      displayName: u?.display_name ?? null,
      grade: u?.grade ?? null,
      status: r.status,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
      consentedVersions: consents.get(r.user_id) ?? [],
    }
  })
  return { applicants, latestVersion: (scopeRes.data[0]?.version as number | undefined) ?? null }
}

export async function reviewMembership(membershipId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('review_membership', { p_membership_id: membershipId, p_approve: approve })
  if (error) throw error
}

export type BulkResult = { done: number; failed: { id: string; reason: string }[] }

export async function reviewMemberships(ids: string[], approve: boolean): Promise<BulkResult> {
  const { data, error } = await supabase.rpc('review_memberships', { p_ids: ids, p_approve: approve })
  if (error) throw error
  return data as BulkResult
}

export function bulkResultMessage(r: BulkResult): string {
  return `${r.done}人を承認しました。${r.failed.length}人は承認できませんでした（同意や入力がまだ、または処理済み）。`
}

const REVIEW_MESSAGES: Record<string, string> = {
  consent_required: '保護者の同意がまだなので、承認できません。',
  profile_incomplete: '表示名と学年が未入力なので、承認できません。',
  not_pending: 'すでに処理されています。画面を更新します。',
  membership_not_found: 'この申し込みは見つかりませんでした。画面を更新します。',
  forbidden: 'このクラブの申し込みを処理する権限がありません。',
}

export function reviewErrorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  for (const [key, message] of Object.entries(REVIEW_MESSAGES)) if (text.includes(key)) return message
  return '処理できませんでした。通信を確認して、もう一度お試しください。'
}

// ---- クラブ設定（運営のみ。RLS で運営以外の書き込みは拒否される） ----

export async function createClub(name: string): Promise<Club> {
  const { data, error } = await supabase.from('clubs').insert({ name }).select(CLUB_COLUMNS).single()
  if (error) throw error
  return toClub(data as ClubRow)
}

export async function updateClub(id: string, patch: { name?: string; allowFreeTasks?: boolean }): Promise<Club> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.allowFreeTasks !== undefined) row.allow_free_tasks = patch.allowFreeTasks
  const { data, error } = await supabase.from('clubs').update(row).eq('id', id).select(CLUB_COLUMNS).single()
  if (error) throw error
  return toClub(data as ClubRow)
}

/** 招待コードを作り直す。まれに重複したときは作り直して試す */
export async function regenerateInviteCode(id: string): Promise<Club> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('clubs')
      .update({ invite_code: generateInviteCode() })
      .eq('id', id)
      .select(CLUB_COLUMNS)
      .single()
    if (!error) return toClub(data as ClubRow)
    if (error.code !== '23505') throw error
  }
  throw new Error('invite_code_conflict')
}

// ---- タスク管理（運営のみ。書き込みは RLS で運営だけに許可されている） ----

type TaskRow = {
  id: string
  club_id: string
  title: string
  subject: string
  starts_on: string
  due_on: string | null
  recurrence: Recurrence
  estimated_minutes: number | null
  archived_at: string | null
}

export type TaskBoard = {
  tasks: AdminTask[]
  /** タスク ID ごとの、今日の完了人数 */
  doneToday: Record<string, number>
  /** 承認済みの生徒数 */
  students: number
}

export async function loadTaskBoard(clubId: string, today: string): Promise<TaskBoard> {
  const [taskRes, doneRes, studentRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, club_id, title, subject, starts_on, due_on, recurrence, estimated_minutes, archived_at')
      .eq('club_id', clubId)
      .eq('kind', 'assigned')
      .order('created_at', { ascending: false }),
    supabase.from('user_tasks').select('task_id').eq('club_id', clubId).eq('is_free', false).eq('task_date', today).not('completed_at', 'is', null),
    supabase.from('club_members').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('member_role', 'student').eq('status', 'approved'),
  ])
  if (taskRes.error) throw taskRes.error
  if (doneRes.error) throw doneRes.error
  if (studentRes.error) throw studentRes.error

  const doneToday: Record<string, number> = {}
  for (const r of doneRes.data) doneToday[r.task_id as string] = (doneToday[r.task_id as string] ?? 0) + 1
  const tasks = (taskRes.data as TaskRow[]).map((r): AdminTask => ({
    id: r.id,
    clubId: r.club_id,
    title: r.title,
    subject: r.subject,
    startsOn: r.starts_on,
    dueOn: r.due_on,
    recurrence: r.recurrence,
    estimatedMinutes: r.estimated_minutes,
    archivedAt: r.archived_at,
  }))
  return { tasks, doneToday, students: studentRes.count ?? 0 }
}

/** 配信するタスクを作る。報酬コインは Phase 2 から（それまでは 0 のまま） */
export async function createTasks(clubIds: string[], draft: Draft, userId: string): Promise<void> {
  const rows = clubIds.map((club_id) => ({
    club_id,
    kind: 'assigned',
    title: draft.title.trim(),
    subject: draft.subject,
    starts_on: draft.startsOn,
    due_on: draft.dueOn || null,
    recurrence: draft.recurrence,
    estimated_minutes: draft.minutes.trim() === '' ? null : Number(draft.minutes),
    created_by: userId,
  }))
  const { error } = await supabase.from('tasks').insert(rows)
  if (error) throw error
}

/** 取り下げる。今日以降の、まだ完了していない割り当ても取り除く（完了済みの記録は残す） */
export async function archiveTask(id: string, today: string): Promise<void> {
  const { error } = await supabase.from('tasks').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  const { error: delError } = await supabase.from('user_tasks').delete().eq('task_id', id).gte('task_date', today).is('completed_at', null)
  if (delError) throw delError
}

// ---- 生徒一覧（09）・生徒の詳細（10）。読み取りは RLS で、運営は全クラブ、クラブ管理者は自クラブだけ ----

export type StudentBoard = {
  students: StudentRow[]
  /** クラブ全体の、直近14日の日別の完了数 */
  clubActivity: { date: string; count: number }[]
  /** 直近14日のうち、大会・遠征・合宿の日（記録の帯で休息日として出す） */
  restDates: string[]
  /** 画面13「記録が空いた」の設定（なければ既定） */
  gapRule: GapRule
  /** 空いた日数の計算に使う、直近90日から1週間先までの大会・遠征・合宿の日 */
  eventDates: string[]
  /** 今日、「見たよ」を送った生徒 */
  seenToday: string[]
  /** 生徒ごとの、休息チケットで休息日にした日（直近90日から1週間先まで） */
  studentRest: Record<string, string[]>
}

type MemberRow = {
  user_id: string
  users: { display_name: string | null; grade: number | null } | { display_name: string | null; grade: number | null }[] | null
}

export async function loadStudentBoard(clubId: string, today: string): Promise<StudentBoard> {
  const since = addDays(today, -13)
  const [memberRes, streakRes, activityRes, tasksRes, eventRes, ruleRes, seenRes, usesRes] = await Promise.all([
    supabase
      .from('club_members')
      .select('user_id, users!club_members_user_id_fkey(display_name, grade)')
      .eq('club_id', clubId)
      .eq('member_role', 'student')
      .eq('status', 'approved'),
    supabase.from('streak_status').select('student_id, current_days, longest_days, last_achieved_date').eq('club_id', clubId),
    supabase.from('daily_activity').select('student_id, activity_date, completed_count').eq('club_id', clubId).gte('activity_date', since).lte('activity_date', today),
    // 配信されたタスクだけ。自由登録の中身（と有無）は、クラブ管理者には見せない
    supabase.from('user_tasks').select('student_id, completed_at').eq('club_id', clubId).eq('is_free', false).eq('task_date', today),
    supabase.from('club_events').select('event_date').eq('club_id', clubId).gte('event_date', addDays(today, -90)).lte('event_date', addDays(today, 7)),
    supabase.from('alert_rules').select('enabled, threshold_days').eq('club_id', clubId).eq('kind', 'gap').maybeSingle(),
    supabase.from('support_comments').select('student_id').eq('club_id', clubId).eq('kind', 'seen').eq('seen_on', today),
    supabase.from('rest_ticket_uses').select('student_id, rest_date').eq('club_id', clubId).gte('rest_date', addDays(today, -90)).lte('rest_date', addDays(today, 7)),
  ])
  if (eventRes.error) throw eventRes.error
  if (seenRes.error) throw seenRes.error
  if (usesRes.error) throw usesRes.error
  if (memberRes.error) throw memberRes.error
  if (streakRes.error) throw streakRes.error
  if (activityRes.error) throw activityRes.error
  if (tasksRes.error) throw tasksRes.error

  // 承認待ちの生徒は、運営が見ても合計に数えない（承認までクラブの数字に入れない）
  const approvedIds = new Set((memberRes.data as unknown as MemberRow[]).map((m) => m.user_id))
  const streaks = new Map(streakRes.data.map((r) => [r.student_id as string, r]))
  const activity = new Map<string, { date: string; count: number }[]>()
  const club = new Map<string, number>()
  for (const r of activityRes.data) {
    const sid = r.student_id as string
    if (!approvedIds.has(sid)) continue
    const date = r.activity_date as string
    const count = r.completed_count as number
    activity.set(sid, [...(activity.get(sid) ?? []), { date, count }])
    club.set(date, (club.get(date) ?? 0) + count)
  }
  const assigned = new Map<string, { total: number; done: number }>()
  for (const r of tasksRes.data) {
    const sid = r.student_id as string
    const cur = assigned.get(sid) ?? { total: 0, done: 0 }
    cur.total++
    if (r.completed_at) cur.done++
    assigned.set(sid, cur)
  }

  const students = (memberRes.data as unknown as MemberRow[]).map((m): StudentRow => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users
    const s = streaks.get(m.user_id)
    const a = activity.get(m.user_id) ?? []
    const t = assigned.get(m.user_id) ?? { total: 0, done: 0 }
    return {
      userId: m.user_id,
      displayName: u?.display_name ?? null,
      grade: u?.grade ?? null,
      assignedTotal: t.total,
      assignedDone: t.done,
      activityToday: a.find((x) => x.date === today)?.count ?? 0,
      currentDays: (s?.current_days as number | undefined) ?? 0,
      longestDays: (s?.longest_days as number | undefined) ?? 0,
      lastAchievedDate: (s?.last_achieved_date as string | null | undefined) ?? null,
      activity: a,
    }
  })
  return {
    students,
    clubActivity: [...club.entries()].map(([date, count]) => ({ date, count })),
    restDates: eventRes.data.map((e) => e.event_date as string).filter((d) => d >= since && d <= today),
    eventDates: eventRes.data.map((e) => e.event_date as string),
    seenToday: (seenRes.data ?? []).map((r) => r.student_id as string),
    studentRest: (usesRes.data ?? []).reduce<Record<string, string[]>>((m, r) => {
      const id = r.student_id as string
      m[id] = [...(m[id] ?? []), r.rest_date as string]
      return m
    }, {}),
    gapRule: ruleRes.data ? { enabled: ruleRes.data.enabled as boolean, thresholdDays: ruleRes.data.threshold_days as number } : DEFAULT_GAP_RULE,
  }
}

export type SupportComment = { id: string; body: string; createdAt: string; mine: boolean; kind: 'comment' | 'seen' }
export type HistoryItem = { id: string; title: string; subject: string; completedAt: string }
export type StudentDetail = {
  student: StudentRow
  /** 直近12週（84日）の、学習した日 */
  studyDates: string[]
  history: HistoryItem[]
  /** 直近30日の、完了したタスクの教科 */
  subjects: string[]
  comments: SupportComment[]
  restDates: string[]
  /** 今日、「見たよ」を送ったか */
  seenToday: boolean
}

type HistoryRow = {
  id: string
  completed_at: string
  tasks: { title: string; subject: string } | { title: string; subject: string }[] | null
}

export async function loadStudentDetail(clubId: string, studentId: string, today: string, myId: string): Promise<StudentDetail | null> {
  const board = await loadStudentBoard(clubId, today)
  const student = board.students.find((s) => s.userId === studentId)
  if (!student) return null

  const [activityRes, historyRes, commentRes] = await Promise.all([
    supabase.from('daily_activity').select('activity_date').eq('student_id', studentId).gt('completed_count', 0).gte('activity_date', addDays(today, -83)).lte('activity_date', today),
    // 完了したタスク。自由登録は含めない（クラブ管理者に中身を見せない）
    supabase
      .from('user_tasks')
      .select('id, completed_at, tasks(title, subject)')
      .eq('student_id', studentId)
      .eq('is_free', false)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(60),
    supabase.from('support_comments').select('id, body, created_at, author_id, kind').eq('student_id', studentId).order('created_at', { ascending: false }).limit(50),
  ])
  if (activityRes.error) throw activityRes.error
  if (historyRes.error) throw historyRes.error
  if (commentRes.error) throw commentRes.error

  const history = (historyRes.data as unknown as HistoryRow[]).flatMap((r): HistoryItem[] => {
    const t = Array.isArray(r.tasks) ? r.tasks[0] : r.tasks
    return t ? [{ id: r.id, title: t.title, subject: t.subject, completedAt: r.completed_at }] : []
  })
  const from = addDays(today, -29)
  return {
    student,
    studyDates: activityRes.data.map((r) => r.activity_date as string),
    history,
    subjects: history.filter((h) => jstDate(h.completedAt) >= from).map((h) => h.subject),
    restDates: [...board.restDates, ...(board.studentRest[studentId] ?? []).filter((d) => d <= today)],
    seenToday: board.seenToday.includes(studentId),
    comments: commentRes.data.map((c) => ({ id: c.id as string, body: c.body as string, createdAt: c.created_at as string, mine: c.author_id === myId, kind: ((c.kind as string | null) ?? 'comment') as 'comment' | 'seen' })),
  }
}

export async function addSupportComment(clubId: string, studentId: string, authorId: string, body: string): Promise<void> {
  const { error } = await supabase.from('support_comments').insert({ club_id: clubId, student_id: studentId, author_id: authorId, body: body.trim() })
  if (error) throw error
}

/** 「見たよ」を送る。その日すでに送っていたら false */
export async function sendSeen(studentId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('send_seen', { p_student_id: studentId })
  if (error) throw error
  return data as boolean
}

export async function deleteSupportComment(id: string): Promise<void> {
  const { error } = await supabase.from('support_comments').delete().eq('id', id)
  if (error) throw error
}

// ---- 大会・遠征・合宿日（クラブ管理者は自クラブ、運営は全クラブ） ----

type EventRow = { id: string; event_date: string; kind: EventKind; note: string | null }

export async function loadClubEvents(clubId: string, from: string): Promise<ClubEvent[]> {
  const { data, error } = await supabase
    .from('club_events')
    .select('id, event_date, kind, note')
    .eq('club_id', clubId)
    .gte('event_date', from)
    .order('event_date', { ascending: true })
  if (error) throw error
  return (data as EventRow[]).map((r) => ({ id: r.id, date: r.event_date, kind: r.kind, note: r.note }))
}

export async function addClubEvent(clubId: string, date: string, kind: EventKind, note: string): Promise<void> {
  const { error } = await supabase.rpc('add_club_event', { p_club_id: clubId, p_date: date, p_kind: kind, p_note: note.trim() === '' ? null : note.trim() })
  if (error) throw error
}

export type RangeResult = { added: number; skipped: number }

export async function addClubEventsRange(clubId: string, from: string, to: string, kind: EventKind, note: string): Promise<RangeResult> {
  const { data, error } = await supabase.rpc('add_club_events_range', {
    p_club_id: clubId, p_from: from, p_to: to, p_kind: kind, p_note: note.trim() === '' ? null : note.trim(),
  })
  if (error) throw error
  return data as RangeResult
}

export async function removeClubEvent(id: string): Promise<void> {
  const { error } = await supabase.rpc('remove_club_event', { p_id: id })
  if (error) throw error
}

// ---- アラートの設定（運営のみ。RLS で運営以外は読めない） ----

type RuleRow = { kind: AlertKind; enabled: boolean; threshold_days: number | null; send_method: SendMethod; template: string }

export async function loadAlertRules(clubId: string): Promise<AlertRule[]> {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('kind, enabled, threshold_days, send_method, template')
    .eq('club_id', clubId)
  if (error) throw error
  return (data as RuleRow[]).map((r) => ({ kind: r.kind, enabled: r.enabled, thresholdDays: r.threshold_days, sendMethod: r.send_method, template: r.template }))
}

export async function saveAlertRule(clubId: string, r: AlertRule): Promise<void> {
  const { error } = await supabase.rpc('save_alert_rule', {
    p_club_id: clubId,
    p_kind: r.kind,
    p_enabled: r.enabled,
    p_threshold_days: r.kind === 'gap' ? r.thresholdDays : null,
    p_send_method: r.sendMethod,
    p_template: r.template.trim(),
  })
  if (error) throw error
}

// ---- 対応アラート（運営のみ） ----

type AlertRow = {
  id: string; student_id: string; display_name: string | null; grade: number | null; kind: AlertKind; detail: Record<string, unknown> | null
  occurred_on: string; status: AlertItem['status']; contacted_at: string | null; resolved_at: string | null
  resumed_after_contact: boolean | null; template: string | null; completed_after_contact: number | null
  line_display_name?: string | null
}

/** 定時生成の最後の実行（運営のみ）。読めなくても画面は止めない */
export async function loadAlertLastRun(): Promise<{ ranAt: string; ok: boolean } | null> {
  const { data, error } = await supabase.rpc('alert_last_run')
  if (error) return null
  const row = ((data ?? []) as { ran_at: string; ok: boolean }[])[0]
  return row ? { ranAt: row.ran_at, ok: row.ok } : null
}

/** 生成と解消を行ってから、対応待ち・連絡済み・直近7日に解消したものを読む */
export async function loadAlerts(clubId: string, now = Date.now()): Promise<AlertItem[]> {
  const { error: refreshError } = await supabase.rpc('refresh_alerts')
  if (refreshError) throw refreshError
  const since = new Date(now - 7 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('alert_list')
    .select('id, student_id, display_name, grade, kind, detail, occurred_on, status, contacted_at, resolved_at, resumed_after_contact, template, completed_after_contact, line_display_name')
    .eq('club_id', clubId)
    .or(`status.in.(open,contacted),and(status.eq.resolved,resolved_at.gte.${since})`)
  if (error) throw error
  return (data as AlertRow[]).map((r) => ({
    id: r.id, studentId: r.student_id, displayName: r.display_name, grade: r.grade, kind: r.kind, detail: r.detail ?? {},
    occurredOn: r.occurred_on, status: r.status, contactedAt: r.contacted_at, resolvedAt: r.resolved_at,
    resumedAfterContact: r.resumed_after_contact, template: r.template, completedAfterContact: r.completed_after_contact,
    lineName: r.line_display_name ?? null,
  }))
}

export async function markAlertsContacted(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('mark_alerts_contacted', { p_ids: ids })
  if (error) throw error
}

export async function undoAlertsContacted(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('undo_alerts_contacted', { p_ids: ids })
  if (error) throw error
}

export async function dismissAlerts(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('dismiss_alerts', { p_ids: ids })
  if (error) throw error
}

export async function markAlertContacted(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_alert_contacted', { p_id: id })
  if (error) throw error
}

export async function dismissAlert(id: string): Promise<void> {
  const { error } = await supabase.rpc('dismiss_alert', { p_id: id })
  if (error) throw error
}

/** 連絡済みの履歴（直近90日、新しい順）。画面13で使う */
export async function loadAlertHistory(clubId: string, now = Date.now()): Promise<AlertItem[]> {
  const since = new Date(now - 90 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('alert_list')
    .select('id, student_id, display_name, grade, kind, detail, occurred_on, status, contacted_at, resolved_at, resumed_after_contact, template, completed_after_contact')
    .eq('club_id', clubId)
    .not('contacted_at', 'is', null)
    .gte('contacted_at', since)
    .order('contacted_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data as AlertRow[]).map((r) => ({
    id: r.id, studentId: r.student_id, displayName: r.display_name, grade: r.grade, kind: r.kind, detail: r.detail ?? {},
    occurredOn: r.occurred_on, status: r.status, contactedAt: r.contacted_at, resolvedAt: r.resolved_at,
    resumedAfterContact: r.resumed_after_contact, template: r.template, completedAfterContact: r.completed_after_contact,
  }))
}

// ---- クラブミッション（運営のみ） ----

type MissionRow = {
  id: string; title: string; description: string | null; metric: AdminMission['metric']; starts_on: string; ends_on: string
  club_goal: number; personal_goal: number; reward_personal_coins: number; reward_club_coins: number
  status: AdminMission['status']; participants: number; club_progress: number; personal_reached: number
  students: { student_id: string; display_name: string | null; progress: number }[]
}

export async function loadAdminMissions(clubId: string): Promise<AdminMission[]> {
  const { data, error } = await supabase.rpc('admin_missions', { p_club_id: clubId })
  if (error) throw error
  return ((data ?? []) as MissionRow[]).map((r) => ({
    id: r.id, title: r.title, description: r.description, metric: r.metric, startsOn: r.starts_on, endsOn: r.ends_on,
    clubGoal: r.club_goal, personalGoal: r.personal_goal, rewardPersonalCoins: r.reward_personal_coins, rewardClubCoins: r.reward_club_coins,
    status: r.status, participants: r.participants, clubProgress: r.club_progress, personalReached: r.personal_reached,
    students: r.students.map((x) => ({ studentId: x.student_id, displayName: x.display_name, progress: x.progress })),
  }))
}

export async function createClubMission(clubId: string, v: ParsedDraft): Promise<void> {
  const { error } = await supabase.rpc('create_club_mission', {
    p_club_id: clubId, p_title: v.title, p_description: v.description, p_metric: v.metric, p_starts_on: v.startsOn, p_ends_on: v.endsOn,
    p_club_goal: v.clubGoal, p_personal_goal: v.personalGoal, p_reward_personal: v.rewardPersonal, p_reward_club: v.rewardClub,
  })
  if (error) throw error
}

export async function cancelClubMission(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_club_mission', { p_id: id })
  if (error) throw error
}
