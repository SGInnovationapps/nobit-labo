import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

type Props = { count: number; children: ReactNode; onClose: () => void }

/** 「タスクを見る」を押したときのシート。今日のタスクの一覧（行の作りはホームと同じ） */
export function TaskSheet({ count, children, onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet sheet-pick" role="dialog" aria-modal="true" aria-labelledby="tasks-title">
        <div className="pick-head">
          <h2 id="tasks-title" className="sheet-title">今日のタスク <span className="num pick-count">{count}</span>件</h2>
          <button ref={close} type="button" className="pick-close" onClick={onClose}>閉じる</button>
        </div>
        {children}
      </div>
    </div>
  )
}
