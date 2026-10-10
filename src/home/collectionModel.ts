// コレクション（04）とガチャ（05）の表示ロジック。画面にも通信にも依存しない純粋な関数。

export type Category = 'title' | 'background' | 'decoration' | 'badge'
export type Rarity = 'normal' | 'rare' | 'super_rare'

export const CATEGORIES: ReadonlyArray<{ key: Category; label: string }> = [
  { key: 'title', label: '称号' },
  { key: 'background', label: '背景' },
  { key: 'decoration', label: '装飾' },
  { key: 'badge', label: 'ガチャ限定バッジ' },
]

export const RARITY_LABEL: Record<Rarity, string> = { normal: 'ノーマル', rare: 'レア', super_rare: 'スーパーレア' }

export type ItemDef = { id: string; name: string; category: Category; rarity: Rarity; sortOrder: number }
export type OwnedItem = { itemId: string; acquiredAt: string; equipped: boolean }

export type CollectionGroup = {
  key: Category
  label: string
  total: number
  owned: { id: string; name: string; rarity: Rarity; acquiredAt: string; equipped: boolean }[]
  /** 未獲得の数 */
  missing: number
}

const RARITY_ORDER: Record<Rarity, number> = { super_rare: 0, rare: 1, normal: 2 }

/** カテゴリごとの所持と未獲得の数。所持は、レアリティの高い順、同じなら新しい順 */
export function groupCollection(items: ReadonlyArray<ItemDef>, owned: ReadonlyArray<OwnedItem>): CollectionGroup[] {
  const ownedMap = new Map(owned.map((o) => [o.itemId, o]))
  return CATEGORIES.map(({ key, label }) => {
    const defs = items.filter((i) => i.category === key)
    const mine = defs
      .filter((d) => ownedMap.has(d.id))
      .map((d) => {
        const o = ownedMap.get(d.id)!
        return { id: d.id, name: d.name, rarity: d.rarity, acquiredAt: o.acquiredAt, equipped: o.equipped }
      })
      .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || b.acquiredAt.localeCompare(a.acquiredAt))
    return { key, label, total: defs.length, owned: mine, missing: defs.length - mine.length }
  })
}

/** 設定中の称号の名前（なければ null） */
export function equippedTitle(items: ReadonlyArray<ItemDef>, owned: ReadonlyArray<OwnedItem>): string | null {
  const o = owned.find((x) => x.equipped && items.find((i) => i.id === x.itemId)?.category === 'title')
  return o ? (items.find((i) => i.id === o.itemId)?.name ?? null) : null
}

export type GachaState = 'ready' | 'no_record' | 'drawn'

/** 今日引けるか。引き済み、その日の学習記録がない、引ける */
export function gachaState(recordsToday: number, drawnToday: boolean): GachaState {
  if (drawnToday) return 'drawn'
  return recordsToday > 0 ? 'ready' : 'no_record'
}

export const GACHA_NOTE: Record<GachaState, string> = {
  ready: '今日の無料ガチャが引けます。',
  no_record: '今日の学習を1件記録すると、無料ガチャが引けます。',
  drawn: '今日の無料ガチャは引きました。次は、あすの0:00からです。',
}

const SET_LABEL: Record<Category, string | null> = {
  title: '称号に設定する', background: '背景に設定する', decoration: '装飾に設定する', badge: null,
}

/** 結果の画面の「設定する」ボタンの文言。バッジは設定できない */
export function setLabel(category: Category): string | null {
  return SET_LABEL[category]
}

export function categoryLabel(category: Category): string {
  return CATEGORIES.find((c) => c.key === category)?.label ?? ''
}

/** 獲得日の表示（10月10日）。JST */
export function acquiredLabel(iso: string): string {
  const t = new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString()
  return `${Number(t.slice(5, 7))}月${Number(t.slice(8, 10))}日`
}

/** 重複したときの案内 */
export function duplicateNote(coins: number): string {
  return `もっているので、＋${coins}コインにかえました`
}

/** ［仮］v1.7：無料の1回のあと、コインで追加の1回（1日1回まで、学習記録がある日だけ） */
export const EXTRA_GACHA_COST = 30
export type ExtraState = 'locked' | 'ready' | 'poor' | 'drawn'

export function extraGachaState(freeDrawn: boolean, extraDrawn: boolean, coins: number): ExtraState {
  if (!freeDrawn) return 'locked'
  if (extraDrawn) return 'drawn'
  return coins >= EXTRA_GACHA_COST ? 'ready' : 'poor'
}

export const EXTRA_NOTE: Record<ExtraState, string> = {
  locked: `無料ガチャを引くと、${EXTRA_GACHA_COST}コインで、もう1回引けます（1日1回まで）。`,
  ready: `${EXTRA_GACHA_COST}コインで、もう1回引けます（1日1回まで）。`,
  poor: `追加ガチャは${EXTRA_GACHA_COST}コインです。コインを集めると引けます。`,
  drawn: '今日の追加ガチャは引きました。',
}
