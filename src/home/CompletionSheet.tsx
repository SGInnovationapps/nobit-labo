import { useEffect, useRef } from 'react'
import { Nobit } from './Nobit'
import { RecordBand } from './RecordBand'
import type { BandCell } from './homeModel'
import { timeLabel } from './homeModel'

type Props = {
  title: string
  completedAt: string
  cells: ReadonlyArray<BandCell>
  currentDays: number
  completedToday: number
  onClose: () => void
}

/** 02 タスク完了の瞬間。ホームの上に重ねるシート。ノビットはここに出る */
export function CompletionSheet({ title, completedAt, cells, currentDays, completedToday, onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <Nobit mood="happy" className="sheet-nobit" />
        <p className="sheet-label">記録しました</p>
        <h2 id="sheet-title" className="sheet-title">{title}</h2>
        <p className="sheet-time num">{timeLabel(completedAt)}</p>
        <RecordBand cells={cells} animateToday />
        <p className="sheet-note">
          今日の完了 <span className="num">{completedToday}</span> 件　連続 <span className="num">{currentDays}</span> 日
        </p>
        <button ref={close} type="button" className="btn btn-primary" onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
