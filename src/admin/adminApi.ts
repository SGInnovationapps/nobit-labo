import { supabase } from '../lib/supabase'
import { generateInviteCode } from './applicants'
import type { Applicant } from './applicants'
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
