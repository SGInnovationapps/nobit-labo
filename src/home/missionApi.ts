import { supabase } from '../lib/supabase'
import type { Mission } from './missionModel'

type Row = {
  id: string; title: string; description: string | null; metric: Mission['metric']; starts_on: string; ends_on: string
  club_goal: number; personal_goal: number; reward_personal_coins: number; reward_club_coins: number
  status: Mission['status']; participants: number; club_progress: number; personal_reached: number
  joined: boolean; my_progress: number | null; my_personal_rewarded: boolean; my_club_rewarded: boolean
}

/** 自分のクラブのミッション。他の生徒の名前は返ってこない */
export async function loadMissions(): Promise<Mission[]> {
  const { data, error } = await supabase.rpc('my_missions')
  if (error) throw error
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id, title: r.title, description: r.description, metric: r.metric, startsOn: r.starts_on, endsOn: r.ends_on,
    clubGoal: r.club_goal, personalGoal: r.personal_goal, rewardPersonalCoins: r.reward_personal_coins, rewardClubCoins: r.reward_club_coins,
    status: r.status, participants: r.participants, clubProgress: r.club_progress, personalReached: r.personal_reached,
    joined: r.joined, myProgress: r.my_progress ?? 0, myPersonalRewarded: r.my_personal_rewarded, myClubRewarded: r.my_club_rewarded,
  }))
}

export async function joinMission(id: string): Promise<void> {
  const { error } = await supabase.rpc('join_mission', { p_mission_id: id })
  if (error) throw error
}
