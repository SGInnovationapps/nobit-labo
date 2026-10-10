import { nobitSrc } from './nobitModel.ts'
import type { NobitMood } from './nobitModel.ts'

type Props = { mood?: NobitMood; className: string }

/** 表情のファイルがまだ置かれていないときは、正面の画像に戻す */
export function Nobit({ mood = 'front', className }: Props) {
  return (
    <img
      className={className}
      src={nobitSrc(mood)}
      alt="ノビット"
      width="120"
      height="120"
      onError={(e) => {
        const img = e.currentTarget
        if (!img.src.endsWith('/nobit/front.png')) img.src = nobitSrc('front')
      }}
    />
  )
}
