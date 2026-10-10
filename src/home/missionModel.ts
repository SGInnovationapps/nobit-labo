// クラブミッション（07）の表示ロジック。画面にも通信にも依存しない。

export type MissionMetric = 'records' | 'study_days'
export type MissionStatus = 'upcoming' | 'active' | 'ended'

export type Mission = {
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
  joined: boolean
  myProgress: number
  myPersonalRewarded: boolean
  myClubRewarded: boolean
}

export const METRIC_LABEL: Record<MissionMetric, string> = {
  records: '学習の記録の数',
  study_days: '学習した日数',
}
export const METRIC_UNIT: Record<MissionMetric, string> = { records: '件', study_days: '日' }

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`

export function periodLabel(startsOn: string, endsOn: string): string {
  return `${md(startsOn)}〜${md(endsOn)}`
}

/** 0〜100 の割合。目標を超えても 100 */
export function percentOf(progress: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((progress / goal) * 100)))
}

function daysBetween(from: string, to: string): number {
  const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  return Math.round((ms(to) - ms(from)) / 86_400_000)
}

/** 期間の状態を一文で。終了日の当日までが期間 */
export function timeNote(m: Pick<Mission, 'status' | 'startsOn' | 'endsOn'>, today: string): string {
  if (m.status === 'upcoming') return `${md(m.startsOn)}から始まります`
  if (m.status === 'ended') return '終了しました'
  const left = daysBetween(today, m.endsOn)
  return left === 0 ? '今日までです' : `あと${left}日（${md(m.endsOn)}まで）`
}

export function rewardLines(m: Pick<Mission, 'rewardPersonalCoins' | 'rewardClubCoins'>): string[] {
  const lines: string[] = []
  if (m.rewardPersonalCoins > 0) lines.push(`自分の目標を達成：${m.rewardPersonalCoins}コイン`)
  if (m.rewardClubCoins > 0) lines.push(`クラブの目標を達成（参加して1回以上記録した人）：${m.rewardClubCoins}コイン`)
  return lines
}

/** 配信中・これから（期間の近い順）と、これまで（終了が新しい順） */
export function splitMissions(missions: ReadonlyArray<Mission>): { current: Mission[]; past: Mission[] } {
  return {
    current: missions.filter((m) => m.status !== 'ended').sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    past: missions.filter((m) => m.status === 'ended').sort((a, b) => b.endsOn.localeCompare(a.endsOn)),
  }
}

/** 終わったミッションの結果。責める書き方はしない */
export function resultText(m: Mission): { club: string; me: string } {
  return {
    club: m.clubProgress >= m.clubGoal ? 'クラブの目標：達成' : `クラブの目標：${m.clubProgress} / ${m.clubGoal}`,
    me: !m.joined ? 'あなた：不参加' : m.myProgress >= m.personalGoal ? 'あなたの目標：達成' : `あなた：${m.myProgress} / ${m.personalGoal}`,
  }
}

export function missionErrorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : ''
  if (text.includes('not_started')) return 'まだ始まっていません。'
  if (text.includes('ended')) return '終了したミッションには参加できません。'
  return '参加できませんでした。通信を確認して、もう一度お試しください。'
}
