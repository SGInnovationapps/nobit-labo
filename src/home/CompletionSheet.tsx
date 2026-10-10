import { useEffect, useRef } from 'react'
import { Nobit } from './Nobit'
import { RecordBand } from './RecordBand'
import type { BandCell } from './homeModel'
import { timeLabel } from './homeModel'

type Props = {
  /** 「今日の最初の記録」「連続記録 7日」など */
  label: string
  title: string
  completedAt: string
  cells: ReadonlyArray<BandCell>
  currentDays: number
  completedToday: number
  /** その日の最初の記録のとき、ガチャ（05）へ直接進める */
  onGacha?: () => void
  onClose: () => void
}

/** 02 記録の瞬間。ホームの上に重ねるシート。出すのは、その日の最初の記録・連続記録の節目・バッジ獲得のときだけ。ノビットはここに出る */
export function CompletionSheet({ label, title, completedAt, cells, currentDays, completedToday, onGacha, onClose }: Props) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <Nobit mood="happy" className="sheet-nobit" />
        <p className="sheet-label">{label}</p>
        <h2 id="sheet-title" className="sheet-title">{title}</h2>
        <p className="sheet-time num">{timeLabel(completedAt)}</p>
        <RecordBand cells={cells} animateToday />
        <p className="sheet-note">
          今日の記録 <span className="num">{completedToday}</span> 件　連続 <span className="num">{currentDays}</span> 日
        </p>
        {onGacha && (
          <button ref={first} type="button" className="btn btn-primary" onClick={onGacha}>今日のガチャを引く</button>
        )}
        <button ref={onGacha ? undefined : first} type="button" className={onGacha ? 'btn btn-secondary' : 'btn btn-primary'} onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
