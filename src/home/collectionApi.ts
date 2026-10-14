import { supabase } from '../lib/supabase'
import { jstDate } from './homeModel'
import type { BadgeCategory, BadgeRow, Category, ItemDef, OwnedItem, Rarity } from './collectionModel'

export type CollectionData = {
  streak: { current: number; longest: number }
  coins: number
  items: ItemDef[]
  owned: OwnedItem[]
  recordsToday: number
  drawnToday: boolean
  extraDrawnToday: boolean
  /** 条件でもらえるバッジ（獲得日・進み具合つき） */
  badges: BadgeRow[]
}

export async function loadCollection(): Promise<CollectionData> {
  const today = jstDate(Date.now())
  const [streakRes, coinRes, itemsRes, ownedRes, activityRes, drawRes, badgeRes] = await Promise.all([
    supabase.from('streak_status').select('current_days, longest_days').maybeSingle(),
    supabase.from('coin_balances').select('balance').maybeSingle(),
    supabase.from('items').select('id, name, category, rarity, sort_order').eq('active', true),
    supabase.from('user_items').select('item_id, acquired_at, equipped'),
    supabase.from('daily_activity').select('completed_count').eq('activity_date', today).maybeSingle(),
    supabase.from('gacha_draws').select('id, is_extra').eq('drawn_on', today),
    supabase.rpc('my_badges'),
  ])
  for (const r of [streakRes, coinRes, itemsRes, ownedRes, activityRes, drawRes, badgeRes]) if (r.error) throw r.error

  return {
    streak: { current: streakRes.data?.current_days ?? 0, longest: streakRes.data?.longest_days ?? 0 },
    coins: coinRes.data?.balance ?? 0,
    items: (itemsRes.data ?? []).map((i) => ({
      id: i.id as string, name: i.name as string, category: i.category as Category,
      rarity: i.rarity as Rarity, sortOrder: i.sort_order as number,
    })),
    owned: (ownedRes.data ?? []).map((o) => ({
      itemId: o.item_id as string, acquiredAt: o.acquired_at as string, equipped: o.equipped as boolean,
    })),
    recordsToday: activityRes.data?.completed_count ?? 0,
    drawnToday: (drawRes.data ?? []).some((d) => !d.is_extra),
    extraDrawnToday: (drawRes.data ?? []).some((d) => d.is_extra),
    badges: ((badgeRes.data ?? []) as Array<Record<string, unknown>>).map((b) => ({
      code: b.code as string, name: b.name as string, category: b.category as BadgeCategory, rarity: b.rarity as Rarity,
      goal: b.goal as number, condition: b.condition as string, earnedOn: (b.earned_on as string | null) ?? null, progress: b.progress as number,
    })),
  }
}

export type GachaResult = {
  itemId: string; name: string; category: Category; rarity: Rarity
  duplicate: boolean; coinsGranted: number; drawnAt: string; extra: boolean
}

export type GachaErrorCode = 'no_record_today' | 'already_drawn' | 'free_draw_first' | 'already_drawn_extra' | 'not_enough_coins' | 'other'
const GACHA_CODES: ReadonlyArray<GachaErrorCode> = ['no_record_today', 'already_drawn_extra', 'already_drawn', 'free_draw_first', 'not_enough_coins']

export class GachaError extends Error {
  code: GachaErrorCode
  constructor(code: GachaErrorCode) {
    super(code)
    this.code = code
  }
}

async function callGacha(fn: 'draw_gacha' | 'draw_gacha_extra'): Promise<GachaResult> {
  const { data, error } = await supabase.rpc(fn)
  if (error) {
    const m = error.message ?? ''
    throw new GachaError(GACHA_CODES.find((c) => m.includes(c)) ?? 'other')
  }
  const d = data as Record<string, unknown>
  return {
    itemId: d.item_id as string, name: d.name as string, category: d.category as Category, rarity: d.rarity as Rarity,
    duplicate: d.duplicate as boolean, coinsGranted: (d.coins_granted as number) ?? 0, drawnAt: d.drawn_at as string,
    extra: (d.extra as boolean | undefined) ?? false,
  }
}

export const drawGacha = () => callGacha('draw_gacha')
/** 無料の1回のあと、コインで追加の1回 */
export const drawGachaExtra = () => callGacha('draw_gacha_extra')

/** 設定する／外す。設定中になったら true */
export async function equipItem(itemId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('equip_item', { p_item_id: itemId })
  if (error) throw error
  return data as boolean
}

/** 公式LINE からの連絡を受け取るか（本人の行だけ読める）。LINE の行がなければ true */
export async function loadContactAllowed(): Promise<boolean> {
  const { data, error } = await supabase.from('line_accounts').select('contact_allowed').maybeSingle()
  if (error) throw error
  return data?.contact_allowed ?? true
}

export async function setContactAllowed(allowed: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_contact_allowed', { p_allowed: allowed })
  if (error) throw error
}
