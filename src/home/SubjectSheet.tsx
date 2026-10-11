import { useEffect, useRef } from 'react'
import { IconTimer } from './HomeIcons'
import { recordedTime, SUBJECTS } from './homeModel'
import type { TagRecord } from './homeModel'

type Props = {
  tags: ReadonlyArray<TagRecord>
  /** 記録している最中の教科 */
  pending: string | null
  /** タイマーが動いている間は「タイマーで記録する」を押せない */
  timerDisabled: boolean
  onPick: (subject: string) => void
  onTimer: () => void
  onClose: () => void
}

/**
 * 「教科を記録する」を押したときのシート。5教科のどれかを1タップで記録する。
 * 今日すでに記録した教科は時刻を出し、押すと内容を足せる（同じ教科は1日1回なので、新しく記録はしない）
 */
export function SubjectSheet({ tags, pending, timerDisabled, onPick, onTimer, onClose }: Props) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet sheet-pick" role="dialog" aria-modal="true" aria-labelledby="pick-title">
        <div className="pick-head">
          <h2 id="pick-title" className="sheet-title">どの教科を記録する？</h2>
          <button type="button" className="pick-close" onClick={onClose}>閉じる</button>
        </div>
        <p className="pick-sub">1タップで記録できます。内容はあとからでも書けます。</p>
        <div className="pick-list">
          {SUBJECTS.map((s, i) => {
            const time = recordedTime(tags, s)
            return (
              <button
                key={s}
                ref={i === 0 ? first : undefined}
                type="button"
                className={time ? 'pick-btn is-recorded' : 'pick-btn'}
                disabled={pending !== null}
                onClick={() => onPick(s)}
              >
                <span className="pick-name">{s}</span>
                {time ? (
                  <span className="pick-state"><span className="num pick-time">{time}</span>記録ずみ · 内容を足す</span>
                ) : (
                  <span className="pick-state">{pending === s ? '記録中…' : '記録する'}</span>
                )}
              </button>
            )
          })}
        </div>
        <button type="button" className="pick-timer" disabled={timerDisabled} onClick={onTimer}>
          <IconTimer size={20} />
          タイマーで記録する
        </button>
      </div>
    </div>
  )
}
