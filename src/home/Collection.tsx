import { useCallback, useEffect, useState } from 'react'
import { gradeLabel } from '../lib/steps'
import { drawGacha, drawGachaExtra, drawGachaReward, equipItem, GachaError, loadCollection } from './collectionApi'
import type { CollectionData, GachaResult } from './collectionApi'
import { acquiredLabel, badgeProgressLabel, BADGE_CATEGORY_LABEL, earnedOnLabel, equippedTitle, EXTRA_NOTE, extraGachaState, GACHA_NOTE, gachaState, groupCollection, RARITY_LABEL, rewardGachaNote, splitBadges } from './collectionModel'
import type { GachaMode } from './collectionModel'
import { GachaSheet } from './GachaSheet'
import { ContactSetting } from './ContactSetting'
import { TabBar } from './TabBar'
import type { Tab } from './TabBar'

type Props = {
  displayName: string | null
  grade: number | null
  onTab: (tab: Tab) => void
  /** ホームから「今日のガチャを引く」（free）・「ごほうびのガチャを引く」（reward）で来たとき、ガチャを開いた状態で始める */
  autoGacha?: GachaMode | null
  onAutoGacha?: () => void
}

const FAIL = '通信できませんでした。通信を確認して、もう一度お試しください。'

/** コレクション（04）：読み込みとガチャの操作 */
export function Collection({ displayName, grade, onTab, autoGacha = null, onAutoGacha }: Props) {
  const [data, setData] = useState<CollectionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gachaOpen, setGachaOpen] = useState(false)
  const [mode, setMode] = useState<GachaMode>('free')
  const [result, setResult] = useState<GachaResult | null>(null)
  const [equipped, setEquipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [gachaError, setGachaError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await loadCollection())
    } catch (e) {
      console.error(e)
      setError('読み込めませんでした。通信を確認して、もう一度お試しください。')
    }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!autoGacha || !data) return
    const ok = autoGacha === 'reward'
      ? data.weeklyReward?.available === true
      : gachaState(data.recordsToday, data.drawnToday) === 'ready'
    if (ok) { setMode(autoGacha); setResult(null); setGachaError(null); setGachaOpen(true) }
    onAutoGacha?.()
  }, [autoGacha, data, onAutoGacha])

  async function onDraw(kind: 'free' | 'extra' | 'reward') {
    setBusy(true)
    setGachaError(null)
    try {
      setResult(await (kind === 'extra' ? drawGachaExtra() : kind === 'reward' ? drawGachaReward() : drawGacha()))
      setEquipped(false)
      await load()
    } catch (e) {
      console.error(e)
      const code = e instanceof GachaError ? e.code : 'other'
      setGachaError(
        code === 'no_record_today' ? '今日の学習を1件記録すると、引けます。'
        : code === 'already_drawn' ? '今日はもう引きました。次は、あすの0:00からです。'
        : code === 'already_drawn_extra' ? '今日の追加ガチャは、もう引きました。'
        : code === 'not_enough_coins' ? 'コインが足りません。'
        : code === 'no_weekly_reward' ? 'ごほうびのガチャは、もう引きました。'
        : code === 'free_draw_first' ? '先に、今日の無料ガチャを引いてください。' : FAIL,
      )
    } finally {
      setBusy(false)
    }
  }

  async function onEquip() {
    if (!result) return
    setBusy(true)
    setGachaError(null)
    try {
      setEquipped(await equipItem(result.itemId))
      await load()
    } catch (e) {
      console.error(e)
      setGachaError(FAIL)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CollectionView
      displayName={displayName}
      grade={grade}
      data={data}
      error={error}
      gachaOpen={gachaOpen}
      mode={mode}
      result={result}
      equipped={equipped}
      busy={busy}
      gachaError={gachaError}
      onOpenGacha={() => { setMode('free'); setResult(null); setGachaError(null); setGachaOpen(true) }}
      onOpenReward={() => { setMode('reward'); setResult(null); setGachaError(null); setGachaOpen(true) }}
      onCloseGacha={() => setGachaOpen(false)}
      onDraw={() => void onDraw(mode)}
      onDrawExtra={() => { setMode('free'); void onDraw('extra') }}
      onOpenExtra={() => { setMode('free'); setResult(null); setGachaError(null); setGachaOpen(true); void onDraw('extra') }}
      onEquip={() => void onEquip()}
      onEquipOwned={(id) => { void equipItem(id).then(load).catch((e) => { console.error(e); setError(FAIL) }) }}
      onTab={onTab}
      footer={<ContactSetting />}
    />
  )
}

type ViewProps = {
  displayName: string | null
  grade: number | null
  data: CollectionData | null
  error: string | null
  gachaOpen: boolean
  /** シートで引くのが、毎日の無料か、週の目標のごほうびか */
  mode?: GachaMode
  result: GachaResult | null
  equipped: boolean
  busy: boolean
  gachaError: string | null
  onOpenGacha: () => void
  onOpenReward?: () => void
  onCloseGacha: () => void
  onDraw: () => void
  onDrawExtra: () => void
  onOpenExtra: () => void
  onEquip: () => void
  onEquipOwned: (itemId: string) => void
  onTab: (tab: Tab) => void
  /** 一覧の下に置くもの（連絡の受け取り設定） */
  footer?: React.ReactNode
}

export function CollectionView(p: ViewProps) {
  const { data } = p
  const groups = data ? groupCollection(data.items, data.owned) : []
  const state = data ? gachaState(data.recordsToday, data.drawnToday) : 'drawn'
  const extra = data ? extraGachaState(data.drawnToday, data.extraDrawnToday, data.coins) : 'locked'
  const title = data ? equippedTitle(data.items, data.owned) : null
  const badges = data ? splitBadges(data.badges) : { earned: [], upcoming: [] }
  const ownedTotal = groups.reduce((n, g) => n + g.owned.length, 0)
  const total = groups.reduce((n, g) => n + g.total, 0)

  return (
    <div className="home collection">
      <header className="home-head">
        <h1 className="brand">コレクション</h1>
        <p className="muted home-sub">
          {p.displayName ?? ''}{p.grade ? `　${gradeLabel(p.grade)}` : ''}{title ? `　称号：${title}` : ''}
        </p>
      </header>

      {p.error && <p className="error" role="alert">{p.error}</p>}
      {!data && !p.error && <p className="muted" role="status">読み込み中…</p>}

      {data && (
        <>
          <section className="streak" aria-label="記録">
            <p className="streak-sub">
              連続 <span className="num">{data.streak.current}</span> 日　最長 <span className="num">{data.streak.longest}</span> 日　コイン <span className="num coin-num">{data.coins}</span>
            </p>
          </section>

          <section className="section" aria-labelledby="gacha-h">
            <h2 id="gacha-h">無料ガチャ</h2>
            <p className="muted">{GACHA_NOTE[state]}</p>
            <button type="button" className="btn btn-primary" disabled={state !== 'ready'} onClick={p.onOpenGacha}>
              {state === 'drawn' ? '今日は引きました' : 'ガチャを引く'}
            </button>
          </section>

          {data.weeklyReward?.available && (
            <section className="section" aria-labelledby="reward-h">
              <h2 id="reward-h">週の目標のごほうび</h2>
              <p className="muted">{rewardGachaNote(data.weeklyReward.week, data.weeklyReward.thisWeek)}</p>
              <button type="button" className="btn btn-primary" disabled={p.busy || !p.onOpenReward} onClick={p.onOpenReward}>
                ごほうびのガチャを引く
              </button>
            </section>
          )}

          <section className="section" aria-labelledby="extra-h">
            <h2 id="extra-h">追加ガチャ</h2>
            <p className="muted">{EXTRA_NOTE[extra]}</p>
            <button type="button" className="btn btn-secondary" disabled={extra !== 'ready' || p.busy} onClick={p.onOpenExtra}>
              {extra === 'drawn' ? '今日は引きました' : '追加で引く'}
            </button>
          </section>

          <section className="section" aria-label="集めた数">
            <p className="coll-total">集めた数 <span className="num">{ownedTotal}</span> / <span className="num">{total}</span></p>
          </section>

          <section className="section" aria-labelledby="earned-badge-h">
            <h2 id="earned-badge-h">バッジ　<span className="coll-count num">{badges.earned.length} / {data.badges.length}</span></h2>
            {badges.earned.length === 0 ? (
              <p className="muted">まだありません。学習を記録すると、もらえます。</p>
            ) : (
              <ul className="item-grid">
                {badges.earned.map((b) => (
                  <li key={b.code} className={`item-card r-${b.rarity}`}>
                    <p className="item-rarity">{RARITY_LABEL[b.rarity]}</p>
                    <p className="item-name">{b.name}</p>
                    <p className="item-date num">{b.earnedOn ? earnedOnLabel(b.earnedOn) : ''}</p>
                  </li>
                ))}
              </ul>
            )}
            {badges.upcoming.length > 0 && (
              <ul className="badge-next" aria-label="これからもらえるバッジ">
                {badges.upcoming.map((b) => (
                  <li key={b.code}>
                    <div className="badge-next-head">
                      <p className="badge-next-name">{b.name}</p>
                      <p className="badge-next-n num">{badgeProgressLabel(b)}</p>
                    </div>
                    <p className="muted badge-next-cond">{BADGE_CATEGORY_LABEL[b.category]}　{b.condition}</p>
                    <div className="next-bar" role="progressbar" aria-valuemin={0} aria-valuemax={b.goal} aria-valuenow={b.progress} aria-label={`${b.name}の進み`}>
                      <i style={{ width: `${Math.round((b.progress / b.goal) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {groups.map((g) => (
            <section key={g.key} className="section" aria-labelledby={`cat-${g.key}`}>
              <h2 id={`cat-${g.key}`}>{g.label}　<span className="coll-count num">{g.owned.length} / {g.total}</span></h2>
              {g.owned.length === 0 ? (
                <p className="muted">まだありません。</p>
              ) : (
                <ul className="item-grid">
                  {g.owned.map((o) => (
                    <li key={o.id} className={`item-card r-${o.rarity}${o.equipped ? ' is-equipped' : ''}`}>
                      <p className="item-rarity">{RARITY_LABEL[o.rarity]}</p>
                      <p className="item-name">{o.name}</p>
                      <p className="item-date num">{acquiredLabel(o.acquiredAt)}</p>
                      {g.key !== 'badge' && (
                        <button type="button" className="item-set" aria-pressed={o.equipped} onClick={() => p.onEquipOwned(o.id)}>
                          {o.equipped ? '設定中（外す）' : '設定する'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {g.missing > 0 && g.owned.length > 0 && <p className="muted coll-missing">未獲得 {g.missing}</p>}
            </section>
          ))}
        </>
      )}

      {p.gachaOpen && (
        <GachaSheet mode={p.mode ?? 'free'} result={p.result} equipped={p.equipped} busy={p.busy} error={p.gachaError} onDraw={p.onDraw} extra={extra} onDrawExtra={p.onDrawExtra} onEquip={p.onEquip} onClose={p.onCloseGacha} />
      )}
      {p.data && p.footer}
      <TabBar current="コレクション" onSelect={p.onTab} />
    </div>
  )
}
