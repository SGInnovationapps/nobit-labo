import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { CollectionView } from '../src/home/Collection'
import type { CollectionData, GachaResult } from '../src/home/collectionApi'
import type { ItemDef } from '../src/home/collectionModel'

const items: ItemDef[] = [
  ['title_first_step', 'はじめの一歩', 'title', 'normal'], ['title_steady', 'コツコツ見習い', 'title', 'normal'],
  ['title_note_friend', 'ノートの友', 'title', 'normal'], ['title_morning_pen', '朝のペンさばき', 'title', 'rare'],
  ['title_idea', 'ひらめき上手', 'title', 'rare'], ['title_partner', 'ノビットの相棒', 'title', 'super_rare'],
  ['bg_mint_morning', 'ミント色の朝', 'background', 'normal'], ['bg_pale_sky', 'うすい空', 'background', 'normal'],
  ['bg_sunset_note', '夕やけのノート', 'background', 'rare'], ['bg_violet_dawn', '夜明けの紫', 'background', 'super_rare'],
  ['deco_thin_frame', '細い線のふち', 'decoration', 'normal'], ['deco_double_frame', '二重のふち', 'decoration', 'rare'],
  ['badge_first_draw', 'ガチャ初引き', 'badge', 'normal'], ['badge_collector', 'コレクター見習い', 'badge', 'rare'],
  ['badge_beginning', 'はじまりの札', 'badge', 'super_rare'],
].map(([id, name, category, rarity], i) => ({ id, name, category, rarity, sortOrder: i }) as ItemDef)

const base: CollectionData = {
  streak: { current: 12, longest: 21 }, coins: 240, items,
  owned: [
    { itemId: 'title_first_step', acquiredAt: '2026-10-05T01:00:00Z', equipped: false },
    { itemId: 'title_partner', acquiredAt: '2026-10-08T01:00:00Z', equipped: true },
    { itemId: 'bg_sunset_note', acquiredAt: '2026-10-09T01:00:00Z', equipped: false },
    { itemId: 'badge_first_draw', acquiredAt: '2026-10-04T01:00:00Z', equipped: false },
  ],
  recordsToday: 2, drawnToday: false,
}
const none = { ...base, owned: [], recordsToday: 0 }
const props = {
  displayName: '表示名', grade: 8, error: null, gachaOpen: false, result: null, equipped: false, busy: false, gachaError: null,
  onOpenGacha() {}, onCloseGacha() {}, onDraw() {}, onEquip() {}, onEquipOwned() {}, onTab() {},
}
const res = (o: Partial<GachaResult>): GachaResult => ({
  itemId: 'x', name: 'ひらめき上手', category: 'title', rarity: 'rare', duplicate: false, coinsGranted: 0, drawnAt: '2026-10-10T01:00:00Z', ...o,
})
const screens: Record<string, JSX.Element> = {
  ready: <CollectionView {...props} data={base} />,
  norecord: <CollectionView {...props} data={{ ...base, recordsToday: 0 }} />,
  drawn: <CollectionView {...props} data={{ ...base, drawnToday: true }} />,
  empty: <CollectionView {...props} data={none} />,
  before: <CollectionView {...props} data={base} gachaOpen />,
  rare: <CollectionView {...props} data={base} gachaOpen result={res({})} />,
  super: <CollectionView {...props} data={base} gachaOpen result={res({ rarity: 'super_rare', name: 'ノビットの相棒' })} />,
  dup: <CollectionView {...props} data={base} gachaOpen result={res({ rarity: 'normal', name: 'ガチャ初引き', category: 'badge', duplicate: true, coinsGranted: 5 })} />,
}
createRoot(document.getElementById('root')!).render(<div className="shell">{screens[location.hash.slice(1)]}</div>)
