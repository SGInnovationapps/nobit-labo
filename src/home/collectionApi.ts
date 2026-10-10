import { supabase } from '../lib/supabase'
import { jstDate } from './homeModel'
import type { Category, ItemDef, OwnedItem, Rarity } from './collectionModel'

export type CollectionData = {
  streak: { current: number; longest: number }
  coins: number
  items: ItemDef[]
  owned: OwnedItem[]
  recordsToday: number
  drawnToday: boolean
  extraDrawnToday: boolean
}

export async function loadCollection(): Promise<CollectionData> {
  const today = jstDate(Date.now())
  const [streakRes, coinRes, itemsRes, ownedRes, activityRes, drawRes] = await Promise.all([
    supabase.from('streak_status').select('current_days, longest_days').maybeSingle(),
    supabase.from('coin_balances').select('balance').maybeSingle(),
    supabase.from('items').select('id, name, category, rarity, sort_order').eq('active', true),
    supabase.from('user_items').select('item_id, acquired_at, equipped'),
    supabase.from('daily_activity').select('completed_count').eq('activity_date', today).maybeSingle(),
    supabase.from('gacha_draws').select('id, is_extra').eq('drawn_on', today),
  ])
  for (const r of [streakRes, coinRes, itemsRes, ownedRes, activityRes, drawRes]) if (r.error) throw r.error

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
