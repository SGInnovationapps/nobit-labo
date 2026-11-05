import { useEffect, useRef, useState } from 'react'
import { Coin } from './Coin'
import { GachaMachine } from './GachaMachine'
import { Nobit } from './Nobit'
import { gachaMood } from './nobitModel'
import { acquiredLabel, capsuleColor, categoryLabel, EXTRA_GACHA_COST, GACHA_ODDS, RARITY_LABEL, setLabel } from './collectionModel'
import type { ExtraState, GachaMode } from './collectionModel'
import type { GachaResult } from './collectionApi'

type Props = {
  /** 毎日の無料ガチャか、週の目標のごほうびか（文言だけが変わる） */
  mode?: GachaMode
  /** null のあいだは、引く前の画面 */
  result: GachaResult | null
  equipped: boolean
  busy: boolean
  error: string | null
  onDraw: () => void
  /** 結果のあとに、追加で引けるか（コインの足りない・引き済みなら押せない） */
  extra: ExtraState
  onDrawExtra: () => void
  onEquip: () => void
  onClose: () => void
  /** 開いてすぐ、追加ガチャを引く（コレクションの「追加で引く」から開いたとき） */
  startExtra?: boolean
}

/** 演出の段階：引く前 → 機械が揺れる → カプセルが落ちる → 結果 */
type Phase = 'idle' | 'shake' | 'open' | 'done'

/** 機械が揺れる最短の時間と、カプセルの時間（合計 約2.4秒。タップでとばせる） */
const SHAKE_MS = 1400
const OPEN_MS = 1000

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * 05 ガチャ。コレクションの上に重ねるシート。2026-11-05 から、控えめな演出を許す：
 * 押すと機械がガタガタ揺れ、レアリティの色のカプセルが落ちて光り、結果が出る。
 * 通信は押した瞬間に始め、演出は結果が届くまで続ける（結果を待たせない）。画面をタップすればとばせる。
 * 端末で「動きを減らす」が設定されていれば、演出なしで結果を出す
 */
export function GachaSheet({ mode = 'free', result, equipped, busy, error, onDraw, extra, onDrawExtra, onEquip, onClose, startExtra = false }: Props) {
  const [phase, setPhase] = useState<Phase>(result ? 'done' : 'idle')
  const [minDone, setMinDone] = useState(false)
  const startResult = useRef<GachaResult | null>(null)
  const timers = useRef<number[]>([])
  const first = useRef<HTMLButtonElement>(null)

  const clear = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = [] }
  useEffect(() => clear, [])

  useEffect(() => {
    if (phase === 'idle' || phase === 'done') first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, phase])

  const fresh = result !== null && result !== startResult.current

  // 揺れの最短時間が過ぎて、新しい結果が届いたら、カプセルの段階へ
  useEffect(() => {
    if (phase !== 'shake' || !minDone || !fresh) return
    setPhase('open')
    timers.current.push(window.setTimeout(() => setPhase('done'), OPEN_MS))
  }, [phase, minDone, fresh])

  // 失敗したら、演出をやめて案内を出す
  useEffect(() => {
    if (error && (phase === 'shake' || phase === 'open')) {
      clear()
      setPhase(result ? 'done' : 'idle')
    }
  }, [error, phase, result])

  function start(draw: () => void) {
    clear()
    startResult.current = result
    draw()
    if (reducedMotion()) { setPhase('done'); return }
    setMinDone(false)
    setPhase('shake')
    timers.current.push(window.setTimeout(() => setMinDone(true), SHAKE_MS))
  }

  // コレクションの「追加で引く」から開いたときは、開いてすぐ演出を始める（1回だけ）
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!startExtra || autoStarted.current) return
    autoStarted.current = true
    start(onDrawExtra)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startExtra])

  function skip() {
    clear()
    if (fresh) setPhase('done')
    else setMinDone(true)
  }

  const shown = phase === 'done' ? result : null
  const set = shown ? setLabel(shown.category) : null
  const animating = phase === 'shake' || phase === 'open'
  const waitingFirst = phase === 'done' && !result

  return (
    <div className="sheet-backdrop">
      <div className="sheet sheet-gacha" role="dialog" aria-modal="true" aria-labelledby="gacha-title">
        {phase === 'idle' || waitingFirst ? (
          <>
            <h2 id="gacha-title" className="sheet-title">{mode === 'reward' ? '週の目標のごほうび' : '今日の無料ガチャ'}</h2>
            <p className="muted gacha-sub">
              {mode === 'reward' ? '目標を達成した週に1回。' : '1日1回。'}称号・背景・かざり・バッジが出るよ。
            </p>
            <div className="gacha-stage">
              <GachaMachine />
              <Nobit mood="excited" className="gacha-nobit" />
            </div>
            <p className="gacha-odds">{GACHA_ODDS}</p>
            {error && <p className="error" role="alert">{error}</p>}
            <button ref={first} type="button" className="btn btn-reward" disabled={busy} onClick={() => start(onDraw)}>{busy ? '引いています…' : 'ガチャを引く'}</button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={onClose}>やめる</button>
          </>
        ) : animating ? (
          <>
            <h2 id="gacha-title" className="sheet-title gacha-sound" aria-live="polite">{phase === 'shake' ? 'ガラガラ…' : 'なにが出るかな…'}</h2>
            <div className="gacha-stage">
              {phase === 'shake' ? (
                <GachaMachine shaking />
              ) : (
                <div className="gacha-capsule-wrap" aria-hidden="true">
                  <span className="gacha-rays" style={{ ['--ray' as string]: capsuleColor(result?.rarity ?? 'normal').glow }} />
                  <span className="gacha-capsule" style={{ background: `linear-gradient(${capsuleColor(result?.rarity ?? 'normal').top} 0 50%, #ffffff 50% 100%)`, boxShadow: `0 0 36px 12px ${capsuleColor(result?.rarity ?? 'normal').glow}` }} />
                </div>
              )}
              <Nobit mood="surprised" className="gacha-nobit" />
            </div>
            <button type="button" className="gacha-skip" onClick={skip}>画面をタップすると、すぐ結果に進みます</button>
          </>
        ) : shown ? (
          <>
            <div className={`gacha-result r-${shown.rarity}`}>
              {shown.rarity === 'super_rare' && !shown.duplicate && (
                <span className="gacha-burst" aria-hidden="true">
                  <span className="spark s1" /><span className="spark s2" /><span className="spark s3" /><span className="spark s4" />
                </span>
              )}
              <p className="gacha-chip">{RARITY_LABEL[shown.rarity]}</p>
              <div className={`gacha-card r-${shown.rarity}`}>
                <p className="gacha-rarity">{categoryLabel(shown.category)}</p>
                <h2 id="gacha-title" className="gacha-name">{shown.name}</h2>
                {shown.duplicate ? (
                  <p className="gacha-dup-note">もう持っていたので、コインに交換したよ。</p>
                ) : (
                  <p className="gacha-new">はじめて手に入れた！</p>
                )}
                <p className="gacha-date num">{acquiredLabel(shown.drawnAt)}</p>
                {shown.duplicate && <span className="gacha-stamp">もう持っていた</span>}
              </div>
              <div className="gacha-after">
                <Nobit mood={gachaMood(shown)} className="gacha-nobit-result" />
                {shown.duplicate && (
                  <p className="gacha-coins" role="status"><Coin amount={shown.coinsGranted} plus look="text" /></p>
                )}
              </div>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            {!shown.duplicate && set && (
              <button ref={first} type="button" className="btn btn-primary" disabled={busy || equipped} onClick={onEquip}>
                {equipped ? '設定しました' : busy ? '設定中…' : set}
              </button>
            )}
            {extra === 'ready' && !shown.reward && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => start(onDrawExtra)}>
                {busy ? '引いています…' : <span><Coin amount={EXTRA_GACHA_COST} look="text" /> でもう1回（1日1回）</span>}
              </button>
            )}
            {extra === 'poor' && !shown.reward && <p className="muted">追加ガチャは <Coin amount={EXTRA_GACHA_COST} look="text" /> です。コインを集めると、もう1回引けます。</p>}
            <p className="muted">
              {shown.reward ? 'ごほうびのガチャは、目標を達成した週に1回です。'
                : shown.extra ? '追加ガチャは1日1回までです。' : '無料ガチャは、あすの0:00にまた引けます。'}
            </p>
            <button ref={!shown.duplicate && set ? undefined : first} type="button" className={!shown.duplicate && set ? 'btn btn-quiet' : 'btn btn-primary'} onClick={onClose}>閉じる</button>
          </>
        ) : null}
      </div>
    </div>
  )
}
