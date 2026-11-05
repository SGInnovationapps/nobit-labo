import { Nobit } from './Nobit'
import type { NobitMood } from './nobitModel'

type Props = {
  mood: NobitMood
  lines: ReadonlyArray<string>
  /** 記録した直後は、ぴょんと跳ねる。ふだんはゆっくり揺れる */
  hop?: boolean
}

/** ホームのノビット：画像と吹き出し。動きは「動きを減らす」の設定では止める */
export function NobitSay({ mood, lines, hop = false }: Props) {
  return (
    <div className="nobit-say">
      <Nobit mood={mood} className={hop ? 'nobit-say-img is-hop' : 'nobit-say-img'} />
      <div className="nobit-bubble" role="status">
        <p className="nobit-bubble-name">ノビット</p>
        <p className="nobit-bubble-text">
          {lines.map((l, i) => <span key={i}>{l}{i < lines.length - 1 && <br />}</span>)}
        </p>
      </div>
    </div>
  )
}
