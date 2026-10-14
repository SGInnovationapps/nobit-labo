// 画面12：クラブミッションの管理の表示ロジック（画面にも通信にも依存しない）
import { addDays } from '../home/homeModel.ts'
import type { MissionMetric, MissionStatus } from '../home/missionModel.ts'

export type AdminMission = {
  id: string
  title: string
  description: string | null
  metric: MissionMetric
  startsOn: string
  endsOn: string
  clubGoal: number
  personalGoal: number
  rewardPersonalCoins: number
  rewardClubCoins: number
  status: MissionStatus
  participants: number
  clubProgress: number
  personalReached: number
  students: { studentId: string; displayName: string | null; progress: number }[]
}

export type MissionDraft = {
  title: string
  description: string
  metric: MissionMetric
  startsOn: string
  endsOn: string
  clubGoal: string
  personalGoal: string
  rewardPersonal: string
  rewardClub: string
}

export const TITLE_MAX = 40
export const DESCRIPTION_MAX = 100
export const MAX_DAYS = 93

export function emptyDraft(today: string): MissionDraft {
  return { title: '', description: '', metric: 'records', startsOn: today, endsOn: addDays(today, 6), clubGoal: '', personalGoal: '', rewardPersonal: '5', rewardClub: '10' }
}

const intIn = (v: string, min: number, max: number): number | null => {
  if (!/^\d+$/.test(v.trim())) return null
  const n = Number(v)
  return n >= min && n <= max ? n : null
}

export type ParsedDraft = {
  title: string; description: string | null; metric: MissionMetric; startsOn: string; endsOn: string
  clubGoal: number; personalGoal: number; rewardPersonal: number; rewardClub: number
}

/** 入力の問題（なければ null）と、保存に使う値 */
export function checkDraft(d: MissionDraft, today: string, existing: ReadonlyArray<Pick<AdminMission, 'startsOn' | 'endsOn' | 'status'>>): { problem: string | null; value: ParsedDraft | null } {
  const title = d.title.trim()
  if (title === '') return { problem: 'タイトルを入力してください', value: null }
  if ([...title].length > TITLE_MAX) return { problem: `タイトルは${TITLE_MAX}文字までです`, value: null }
  if ([...d.description.trim()].length > DESCRIPTION_MAX) return { problem: `説明は${DESCRIPTION_MAX}文字までです`, value: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(d.endsOn)) return { problem: '期間の日付を入力してください', value: null }
  if (d.endsOn < d.startsOn) return { problem: '終了日は開始日以降にしてください', value: null }
  if (d.endsOn < today) return { problem: '終わった期間は登録できません', value: null }
  if (d.endsOn > addDays(d.startsOn, MAX_DAYS - 1)) return { problem: `期間は${MAX_DAYS}日以内にしてください`, value: null }
  if (existing.some((m) => m.status !== 'ended' && m.startsOn <= d.endsOn && m.endsOn >= d.startsOn)) return { problem: 'ほかのミッションと期間が重なっています', value: null }
  const clubGoal = intIn(d.clubGoal, 1, 100000)
  if (clubGoal === null) return { problem: 'クラブの目標は1以上の整数で入力してください', value: null }
  const personalGoal = intIn(d.personalGoal, 1, 1000)
  if (personalGoal === null) return { problem: '個人の目標は1以上の整数で入力してください', value: null }
  const rewardPersonal = intIn(d.rewardPersonal, 0, 1000)
  const rewardClub = intIn(d.rewardClub, 0, 1000)
  if (rewardPersonal === null || rewardClub === null) return { problem: '報酬のコインは0以上の整数で入力してください', value: null }
  return { problem: null, value: { title, description: d.description.trim() || null, metric: d.metric, startsOn: d.startsOn, endsOn: d.endsOn, clubGoal, personalGoal, rewardPersonal, rewardClub } }
}

/**
 * ［仮］v1.7：ミッションの複製。タイトル・説明・数えるもの・目標・報酬を引き継ぎ、
 * 期間は元と同じ長さで、今日から始める（ほかのミッションと重なるときは、画面で日付を直す）
 */
export function draftFromMission(m: AdminMission, today: string): MissionDraft {
  const days = Math.max(1, Math.round((Date.parse(`${m.endsOn}T00:00:00Z`) - Date.parse(`${m.startsOn}T00:00:00Z`)) / 86_400_000) + 1)
  return {
    title: m.title, description: m.description ?? '', metric: m.metric,
    startsOn: today, endsOn: addDays(today, days - 1),
    clubGoal: String(m.clubGoal), personalGoal: String(m.personalGoal),
    rewardPersonal: String(m.rewardPersonalCoins), rewardClub: String(m.rewardClubCoins),
  }
}

export type BulkResult = { clubName: string; error: string | null }

/** 複数クラブへの一括作成の結果の文。1クラブずつ作り、作れなかったクラブはその理由を添える */
export function bulkResultText(results: ReadonlyArray<BulkResult>): { text: string; allFailed: boolean } {
  const ok = results.filter((r) => r.error === null)
  const ng = results.filter((r) => r.error !== null)
  if (results.length === 1) {
    return ng.length === 0 ? { text: 'ミッションを作りました。', allFailed: false } : { text: ng[0].error as string, allFailed: true }
  }
  const head = ok.length > 0 ? `${ok.length}クラブにミッションを作りました。` : ''
  const tail = ng.map((r) => `${r.clubName}：${r.error}`).join('\n')
  return { text: [head, tail].filter((x) => x !== '').join('\n'), allFailed: ok.length === 0 }
}

/** 個人目標に届いた生徒の割合（参加者が0なら null） */
export function reachedRate(m: Pick<AdminMission, 'participants' | 'personalReached'>): number | null {
  return m.participants === 0 ? null : Math.round((m.personalReached / m.participants) * 100)
}

export function splitAdmin(missions: ReadonlyArray<AdminMission>): { current: AdminMission[]; past: AdminMission[] } {
  return {
    current: missions.filter((m) => m.status !== 'ended').sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    past: missions.filter((m) => m.status === 'ended').sort((a, b) => b.endsOn.localeCompare(a.endsOn)),
  }
}

export function missionAdminError(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  const table: Record<string, string> = {
    period_overlap: 'ほかのミッションと期間が重なっています。',
    past_period: '終わった期間は登録できません。',
    invalid_period: '終了日は開始日以降にしてください。',
    forbidden: 'ミッションを作れるのは運営だけです。',
  }
  for (const [k, v] of Object.entries(table)) if (text.includes(k)) return v
  return '保存できませんでした。通信を確認して、もう一度お試しください。'
}
