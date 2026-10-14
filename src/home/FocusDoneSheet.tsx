import { useEffect, useRef } from 'react'
import { Nobit } from './Nobit'
import { coinNote } from './homeModel'

type Props = {
  subject: string
  coins: number
  currentDays: number
  /** 新しく得たバッジの名前（あるときだけ） */
  badges?: ReadonlyArray<string>
  onClose: () => void
}

/** 15分集中を達成した瞬間。ノビットはここにも出る（途中で終えたときは出さない） */
export function FocusDoneSheet({ subject, coins, currentDays, badges, onClose }: Props) {
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
        <Nobit mood="cheer" className="sheet-nobit" />
        <p className="sheet-label">15分集中を達成しました</p>
        <h2 id="focus-done-title" className="sheet-title">{subject}</h2>
        <p className="sheet-time num">15:00</p>
        {badges && badges.length > 0 && (
          <ul className="sheet-badges" aria-label="新しいバッジ">
            {badges.map((b) => <li key={b}>バッジ「{b}」を獲得</li>)}
          </ul>
        )}
        <p className="sheet-note">
          {coins > 0 && <>{coinNote(coins)}　</>}連続 <span className="num">{currentDays}</span> 日
        </p>
        <button ref={close} type="button" className="btn btn-primary" onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
