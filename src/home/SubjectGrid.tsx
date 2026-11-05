import { recordedTime, SUBJECTS } from './homeModel'
import type { TagRecord } from './homeModel'

type Props = {
  title: string
  /** ノビットの吹き出しがあるときは出さない */
  sub?: string
  tags: ReadonlyArray<TagRecord>
  /** 記録している最中の教科 */
  pending: string | null
  /** タイマーが動いている間は「時間を測って記録」を押せない */
  timerDisabled: boolean
  onPick: (subject: string) => void
  onTimer: () => void
}

/**
 * ホームの主役：5教科のボタンを直接並べ、押した時点で今日の記録にする（1タップ）。
 * 記録した教科は面をミントにし、時刻と「記録ずみ」を文字でも出す。押すと内容を足せる（同じ教科は1日1回）。
 * 6つ目は「時間を測って記録」（タイマー）。押してほしいボタンは、紺の太い枠と下の段差でくっきり見せる
 */
export function SubjectGrid({ title, sub, tags, pending, timerDisabled, onPick, onTimer }: Props) {
  return (
    <section className="subj" aria-labelledby="subj-h">
      <h2 id="subj-h" className="subj-title">{title}</h2>
      {sub && <p className="subj-sub">{sub}</p>}
      <div className="subj-grid">
        {SUBJECTS.map((s) => {
          const time = recordedTime(tags, s)
          return (
            <button
              key={s}
              type="button"
              className={time ? 'subj-btn is-recorded' : 'subj-btn'}
              disabled={pending !== null}
              onClick={() => onPick(s)}
              aria-label={time ? `${s}、${time}に記録ずみ。内容を足す` : `${s}を記録する`}
            >
              <span className="subj-name">{s}</span>
              {time ? (
                <span className="subj-state"><span className="num">{time}</span> 記録ずみ</span>
              ) : pending === s ? (
                <span className="subj-state">記録中…</span>
              ) : null}
            </button>
          )
        })}
        <button type="button" className="subj-btn subj-timer" disabled={timerDisabled} onClick={onTimer}>
          時間を<br />測って記録
        </button>
      </div>
    </section>
  )
}
