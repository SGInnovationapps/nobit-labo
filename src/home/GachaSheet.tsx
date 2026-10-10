import { useEffect, useRef } from 'react'
import { acquiredLabel, categoryLabel, duplicateNote, RARITY_LABEL, setLabel } from './collectionModel'
import type { GachaResult } from './collectionApi'

type Props = {
  /** null のあいだは、引く前の画面 */
  result: GachaResult | null
  equipped: boolean
  busy: boolean
  error: string | null
  onDraw: () => void
  onEquip: () => void
  onClose: () => void
}

/** 05 無料ガチャ。ホームではなくコレクションの上に重ねるシート。ノビットはここに出る */
export function GachaSheet({ result, equipped, busy, error, onDraw, onEquip, onClose }: Props) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, result])

  const set = result ? setLabel(result.category) : null

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="gacha-title">
        <img className="sheet-nobit" src="/nobit/front.png" alt="ノビット" width="120" height="120" />
        {!result ? (
          <>
            <h2 id="gacha-title" className="sheet-title">今日の無料ガチャ</h2>
            <p className="muted">1日1回。称号・背景・装飾・ガチャ限定バッジのどれかが当たります。</p>
            {error && <p className="error" role="alert">{error}</p>}
            <button ref={first} type="button" className="btn btn-primary" disabled={busy} onClick={onDraw}>{busy ? '引いています…' : 'ガチャを引く'}</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>やめる</button>
          </>
        ) : (
          <>
            <p className="sheet-label">ガチャの結果</p>
            <div className={`gacha-card r-${result.rarity}`}>
              <p className="gacha-rarity">{RARITY_LABEL[result.rarity]}　{categoryLabel(result.category)}</p>
              <h2 id="gacha-title" className="gacha-name">{result.name}</h2>
              <p className="gacha-date num">{acquiredLabel(result.drawnAt)}</p>
            </div>
            {result.duplicate ? (
              <p className="sheet-note" role="status">{duplicateNote(result.coinsGranted)}</p>
            ) : set ? (
              <button ref={first} type="button" className="btn btn-secondary" disabled={busy || equipped} onClick={onEquip}>
                {equipped ? '設定しました' : busy ? '設定中…' : set}
              </button>
            ) : null}
            {error && <p className="error" role="alert">{error}</p>}
            <p className="muted">次に引けるのは、あすの0:00です。</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>閉じる</button>
          </>
        )}
      </div>
    </div>
  )
}
