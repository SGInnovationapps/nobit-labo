import { useEffect, useRef } from 'react'
import { Coin } from './Coin'
import { Nobit } from './Nobit'
import { timeLabel } from './homeModel'

type Props = {
  /** 「今日の最初の記録」「連続記録 7日」など */
  label: string
  title: string
  completedAt: string
  currentDays: number
  completedToday: number
  /** 今回の記録でもらったコイン（0 なら出さない） */
  coins?: number
  /** 新しく得たバッジの名前（あるときだけ） */
  badges?: ReadonlyArray<string>
  /** その日の最初の記録のとき、ガチャ（05）へ直接進める */
  onGacha?: () => void
  onClose: () => void
}

/**
 * 02 記録の瞬間。ホームの上に重ねるシート。出すのは、その日の最初の記録・連続記録の節目・バッジ獲得のときだけ。
 * お祝いのノビットが飛び出し、まわりがきらきら光る（2026-11-05 から控えめな演出を許す。動きを減らす設定では止める）
 */
export function CompletionSheet({ label, title, completedAt, currentDays, completedToday, coins = 0, badges, onGacha, onClose }: Props) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop">
      <div className="sheet sheet-moment" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="moment-stage" aria-hidden="true">
          <span className="spark s1" /><span className="spark s2" /><span className="spark s3" /><span className="spark s4" />
          <Nobit mood="celebrate" className="moment-nobit" />
        </div>
        <p className="sheet-label">{label}</p>
        <h2 id="sheet-title" className="sheet-title">{title}</h2>
        <p className="sheet-time num">{timeLabel(completedAt)}</p>
        <p className="sheet-note">
          連続 <span className="num">{currentDays}</span> 日目　今日の記録 <span className="num">{completedToday}</span> 件
        </p>
        {badges && badges.length > 0 && (
          <ul className="sheet-badges" aria-label="新しいバッジ">
            {badges.map((b) => <li key={b}>バッジ「{b}」を獲得</li>)}
          </ul>
        )}
        {coins > 0 && (
          <p className="moment-coins"><Coin amount={coins} plus look="text" /><span className="moment-coins-note">もらったコイン</span></p>
        )}
        {onGacha && (
          <button ref={first} type="button" className="btn btn-reward" onClick={onGacha}>今日のガチャを引く</button>
        )}
        <button ref={onGacha ? undefined : first} type="button" className={onGacha ? 'btn btn-quiet' : 'btn btn-primary'} onClick={onClose}>閉じる</button>
      </div>
    </div>
  )
}
