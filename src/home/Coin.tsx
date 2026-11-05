import { COIN } from './homeModel'

type Props = {
  amount: number
  /** 増えた分を出すとき（+ をつける） */
  plus?: boolean
  /** chip：黄色の面つき（持っているコイン・課題のごほうび）／text：文字だけ */
  look?: 'chip' | 'text'
  className?: string
}

/**
 * コインの表し方をそろえる部品（2026-11-05）。数字の前に🪙、増えるときは +。
 * 🪙は読み上げでは「コイン」と読ませる（絵文字の名前が端末でまちまちのため）
 */
export function Coin({ amount, plus = false, look = 'chip', className = '' }: Props) {
  return (
    <span className={`coin coin-${look} ${className}`.trim()}>
      <span aria-hidden="true">{COIN}</span>
      <span className="sr-only">コイン</span>
      <span className="num">{plus ? `+${amount}` : amount}</span>
    </span>
  )
}
