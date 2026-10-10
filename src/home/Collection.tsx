import { useCallback, useEffect, useState } from 'react'
import { gradeLabel } from '../lib/steps'
import { drawGacha, equipItem, GachaError, loadCollection } from './collectionApi'
import type { CollectionData, GachaResult } from './collectionApi'
import { acquiredLabel, equippedTitle, GACHA_NOTE, gachaState, groupCollection, RARITY_LABEL } from './collectionModel'
import { GachaSheet } from './GachaSheet'
import { TabBar } from './TabBar'
import type { Tab } from './TabBar'

type Props = { displayName: string | null; grade: number | null; onTab: (tab: Tab) => void }

const FAIL = '通信できませんでした。通信を確認して、もう一度お試しください。'

/** コレクション（04）：読み込みとガチャの操作 */
export function Collection({ displayName, grade, onTab }: Props) {
  const [data, setData] = useState<CollectionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gachaOpen, setGachaOpen] = useState(false)
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

  async function onDraw() {
    setBusy(true)
    setGachaError(null)
    try {
      setResult(await drawGacha())
      setEquipped(false)
      await load()
    } catch (e) {
      console.error(e)
      const code = e instanceof GachaError ? e.code : 'other'
      setGachaError(
        code === 'no_record_today' ? '今日の学習を1件記録すると、引けます。'
        : code === 'already_drawn' ? '今日はもう引きました。次は、あすの0:00からです。' : FAIL,
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
      result={result}
      equipped={equipped}
      busy={busy}
      gachaError={gachaError}
      onOpenGacha={() => { setResult(null); setGachaError(null); setGachaOpen(true) }}
      onCloseGacha={() => setGachaOpen(false)}
      onDraw={() => void onDraw()}
      onEquip={() => void onEquip()}
      onEquipOwned={(id) => { void equipItem(id).then(load).catch((e) => { console.error(e); setError(FAIL) }) }}
      onTab={onTab}
    />
  )
}

type ViewProps = {
  displayName: string | null
  grade: number | null
  data: CollectionData | null
  error: string | null
  gachaOpen: boolean
  result: GachaResult | null
  equipped: boolean
  busy: boolean
  gachaError: string | null
  onOpenGacha: () => void
  onCloseGacha: () => void
  onDraw: () => void
  onEquip: () => void
  onEquipOwned: (itemId: string) => void
  onTab: (tab: Tab) => void
}

export function CollectionView(p: ViewProps) {
  const { data } = p
  const groups = data ? groupCollection(data.items, data.owned) : []
  const state = data ? gachaState(data.recordsToday, data.drawnToday) : 'drawn'
  const title = data ? equippedTitle(data.items, data.owned) : null
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

          <section className="section" aria-label="集めた数">
            <p className="coll-total">集めた数 <span className="num">{ownedTotal}</span> / <span className="num">{total}</span></p>
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
        <GachaSheet result={p.result} equipped={p.equipped} busy={p.busy} error={p.gachaError} onDraw={p.onDraw} onEquip={p.onEquip} onClose={p.onCloseGacha} />
      )}
      <TabBar current="コレクション" onSelect={p.onTab} />
    </div>
  )
}
