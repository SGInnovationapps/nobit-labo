import { supabase } from './supabase'
import type { MembershipStatus, Role, Snapshot } from './steps'

export class InviteError extends Error {}

type MembershipRow = {
  id: string
  club_id: string
  status: MembershipStatus
  clubs: { name: string } | { name: string }[] | null
}

function clubNameOf(clubs: MembershipRow['clubs']): string | null {
  if (!clubs) return null
  return Array.isArray(clubs) ? (clubs[0]?.name ?? null) : clubs.name
}

/** いまの状態（本人の行・所属・同意）をまとめて読む。RLS で、自分の分だけが返る */
export async function loadSnapshot(): Promise<Snapshot> {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('ログイン情報を確認できませんでした')
  const userId = auth.user.id

  const [userRes, memberRes, scopeRes] = await Promise.all([
    supabase.from('users').select('role, display_name, grade').eq('id', userId).maybeSingle(),
    supabase
      .from('club_members')
      .select('id, club_id, status, clubs(name)')
      .eq('user_id', userId)
      .eq('member_role', 'student')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.from('consent_scope_versions').select('version, summary').order('version', { ascending: false }).limit(1),
  ])
  if (userRes.error) throw userRes.error
  if (memberRes.error) throw memberRes.error
  if (scopeRes.error) throw scopeRes.error
  if (!userRes.data) throw new Error('ユーザー情報が見つかりませんでした')

  const member = (memberRes.data as unknown as MembershipRow[])[0] ?? null
  const scope = scopeRes.data[0] ?? null

  let consentedVersions: number[] = []
  if (member && (member.status === 'pending' || member.status === 'approved')) {
    const consentRes = await supabase
      .from('parental_consents')
      .select('scope_version')
      .eq('student_id', userId)
      .eq('club_id', member.club_id)
    if (consentRes.error) throw consentRes.error
    consentedVersions = consentRes.data.map((c) => c.scope_version as number)
  }

  return {
    userId,
    role: userRes.data.role as Role,
    displayName: userRes.data.display_name,
    grade: userRes.data.grade,
    membership: member
      ? { id: member.id, clubId: member.club_id, clubName: clubNameOf(member.clubs), status: member.status }
      : null,
    latestScope: scope ? { version: scope.version as number, summary: scope.summary as string } : null,
    consentedVersions,
  }
}

/** 招待コードでクラブに申し込む（所属は「承認待ち」になる） */
export async function joinClub(inviteCode: string): Promise<void> {
  const { error } = await supabase.rpc('join_club', { p_invite_code: inviteCode })
  if (!error) return
  if (error.message.includes('invalid_invite_code')) throw new InviteError('invalid_invite_code')
  if (error.message.includes('already_member')) return // すでに申し込み済みなら、そのまま続ける
  throw error
}

/** 保護者の同意を記録する。同じ版にすでに同意していれば、何もしない */
export async function recordConsent(userId: string, clubId: string, scopeVersion: number): Promise<void> {
  const { error } = await supabase
    .from('parental_consents')
    .insert({ club_id: clubId, student_id: userId, scope_version: scopeVersion })
  if (error && error.code !== '23505') throw error
}

export async function saveProfile(userId: string, displayName: string, grade: number): Promise<void> {
  const { data, error } = await supabase
    .from('users')
    .update({ display_name: displayName, grade })
    .eq('id', userId)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('profile_not_saved')
}
