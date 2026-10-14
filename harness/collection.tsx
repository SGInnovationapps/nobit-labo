import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { CollectionView } from '../src/home/Collection'
import { ContactSettingView } from '../src/home/ContactSetting'
import type { CollectionData, GachaResult } from '../src/home/collectionApi'
import type { ItemDef } from '../src/home/collectionModel'
import { CompletionSheet } from '../src/home/CompletionSheet'
import { buildBand } from '../src/home/homeModel'

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
  recordsToday: 2, drawnToday: false, extraDrawnToday: false,
  badges: [
    { code: 'streak_3', name: '3日連続', category: 'streak', rarity: 'normal', goal: 3, condition: '3日連続で学習を記録する', earnedOn: '2026-10-04', progress: 3 },
    { code: 'streak_7', name: '7日連続', category: 'streak', rarity: 'rare', goal: 7, condition: '7日連続で学習を記録する', earnedOn: '2026-10-08', progress: 7 },
    { code: 'subject_eng', name: '英語のはじめて', category: 'subject', rarity: 'normal', goal: 1, condition: '英語を初めて記録する', earnedOn: '2026-10-01', progress: 1 },
    { code: 'streak_30', name: '30日連続', category: 'streak', rarity: 'super_rare', goal: 30, condition: '30日連続で学習を記録する', earnedOn: null, progress: 21 },
    { code: 'focus_10', name: '集中のつみかさね', category: 'action', rarity: 'rare', goal: 10, condition: '15分集中を10回達成する', earnedOn: null, progress: 9 },
    { code: 'focus_first', name: '15分チャレンジャー', category: 'action', rarity: 'normal', goal: 1, condition: '15分集中を初めて達成する', earnedOn: null, progress: 0 },
    { code: 'mission_join', name: 'クラブミッション参加', category: 'event', rarity: 'normal', goal: 1, condition: 'クラブミッションに初めて参加する', earnedOn: null, progress: 0 },
  ],
}
const none = { ...base, owned: [], recordsToday: 0, badges: base.badges.map((b) => ({ ...b, earnedOn: null, progress: 0 })) }
const props = {
  displayName: '表示名', grade: 8, error: null, gachaOpen: false, result: null, equipped: false, busy: false, gachaError: null,
  onOpenGacha() {}, onCloseGacha() {}, onDraw() {}, onEquip() {}, onEquipOwned() {}, onTab() {},
}
const res = (o: Partial<GachaResult>): GachaResult => ({
  itemId: 'x', name: 'ひらめき上手', category: 'title', rarity: 'rare', duplicate: false, coinsGranted: 0, drawnAt: '2026-10-10T01:00:00Z', ...o,
})
const cells = buildBand([{ date: '2026-10-08', count: 2 }, { date: '2026-10-09', count: 3 }], '2026-10-09', 14, [])
const screens: Record<string, JSX.Element> = {
  sheet_badge: <CompletionSheet label="バッジ獲得" title="数学を記録" completedAt="2026-10-09T08:05:00Z" cells={cells} currentDays={4} completedToday={2} badges={['数学のはじめて']} onClose={() => {}} />,
  ready: <CollectionView {...props} data={base} footer={<ContactSettingView allowed onChange={() => {}} busy={false} error={null} />} />,
  contact_off: <CollectionView {...props} data={base} footer={<ContactSettingView allowed={false} onChange={() => {}} busy={false} error={null} />} />,
  norecord: <CollectionView {...props} data={{ ...base, recordsToday: 0 }} />,
  drawn: <CollectionView {...props} data={{ ...base, drawnToday: true }} />,
  empty: <CollectionView {...props} data={none} />,
  before: <CollectionView {...props} data={base} gachaOpen />,
  rare: <CollectionView {...props} data={base} gachaOpen result={res({})} />,
  super: <CollectionView {...props} data={base} gachaOpen result={res({ rarity: 'super_rare', name: 'ノビットの相棒' })} />,
  dup: <CollectionView {...props} data={base} gachaOpen result={res({ rarity: 'normal', name: 'ガチャ初引き', category: 'badge', duplicate: true, coinsGranted: 5 })} />,
}
createRoot(document.getElementById('root')!).render(<div className="shell">{screens[location.hash.slice(1)]}</div>)
