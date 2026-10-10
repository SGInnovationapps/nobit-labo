import { useEffect, useRef } from 'react'
import { coinNote } from './homeModel'

type Props = {
  subject: string
  coins: number
  currentDays: number
  onClose: () => void
}

/** 15分集中を達成した瞬間。ノビットはここにも出る（途中で終えたときは出さない） */
export function FocusDoneSheet({ subject, coins, currentDays, onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="focus-done-title">
        <img className="sheet-nobit" src="/nobit/front.png" alt="ノビット" width="120" height="120" />
        <p className="sheet-label">15分集中を達成しました</p>
        <h2 id="focus-done-title" className="sheet-title">{subject}</h2>
        <p className="sheet-time num">15:00</p>
        <p className="sheet-note">
          {coins > 0 && <>{coinNote(coins)}　</>}連続 <span className="num">{currentDays}</span> 日
        </p>
        <button ref={close} type="button" className="btn btn-primary" onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
