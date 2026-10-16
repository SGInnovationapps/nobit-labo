import { useEffect, useRef, useState } from 'react'
import { modeLabel, progressLabel } from './drillModel'
import type { DrillMode } from './drillModel'
import type { DrillQuestion, DrillVerdict } from './drillApi'

type Props = {
  subject: string
  mode: DrillMode
  category: string | null
  total: number
  answered: number
  correctCount: number
  question: DrillQuestion
  /** 答えたあとの採点（まだ答えていなければ null） */
  verdict: DrillVerdict | null
  busy: boolean
  error: string | null
  onAnswer: (choice: string) => void
  onNext: () => void
  onQuit: () => void
}

/**
 * 出題と答え合わせ（画面C・D）。選択肢を押すと採点し、同じ画面に正解と解説を出す。
 * 正解は答えたあとにだけ画面へ届く（採点は Supabase の関数で行う）。
 */
export function DrillPlay(p: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const next = useRef<HTMLButtonElement>(null)

  // 次の問題に進んだら、選んだ印を消す
  useEffect(() => setPicked(null), [p.question.id])
  useEffect(() => { if (p.verdict) next.current?.focus() }, [p.verdict])

  const done = p.verdict !== null

  return (
    <div className="drill drill-play">
      <header className="drill-head">
        <p className="drill-where">
          {p.subject}　<span className="drill-mode">{modeLabel(p.mode, p.category ?? p.question.category)}</span>
        </p>
        <button type="button" className="pick-close" disabled={p.busy} onClick={p.onQuit}>やめる</button>
      </header>

      <p className="drill-progress" role="status">
        {progressLabel(p.answered, p.total)}　正解 <span className="num">{p.correctCount}</span>
      </p>
      <div className="drill-bar" aria-hidden="true">
        <i style={{ width: `${Math.round((p.answered / p.total) * 100)}%` }} />
      </div>

      <section className="drill-q" aria-labelledby="drill-q-h">
        <h1 id="drill-q-h" className="drill-q-body">{p.question.body}</h1>
        {p.question.imageUrl && <img className="drill-q-img" src={p.question.imageUrl} alt="" />}
      </section>

      {p.error && <p className="error" role="alert">{p.error}</p>}

      <ul className="drill-choices">
        {p.question.choices.map((c) => {
          const isAnswer = done && c === p.verdict?.answer
          const isPicked = c === picked
          const cls = ['drill-choice']
          if (isAnswer) cls.push('is-answer')
          else if (done && isPicked) cls.push('is-wrong')
          else if (done) cls.push('is-dim')
          return (
            <li key={c}>
              <button
                type="button"
                className={cls.join(' ')}
                disabled={p.busy || done}
                onClick={() => { setPicked(c); p.onAnswer(c) }}
              >
                <span className="drill-choice-text">{c}</span>
                {isAnswer && <span className="drill-choice-mark">正解</span>}
                {done && isPicked && !isAnswer && <span className="drill-choice-mark is-wrong">えらんだ答え</span>}
              </button>
            </li>
          )
        })}
      </ul>

      {done && p.verdict && (
        <section className="drill-verdict" aria-live="polite">
          <p className={p.verdict.correct ? 'drill-verdict-head is-ok' : 'drill-verdict-head'}>
            {p.verdict.correct ? 'あっている' : 'ちがう'}
          </p>
          {!p.verdict.correct && <p className="drill-verdict-answer">答え　{p.verdict.answer}</p>}
          {p.verdict.explanation && <p className="drill-verdict-note">{p.verdict.explanation}</p>}
          <button ref={next} type="button" className="btn btn-primary drill-next" disabled={p.busy} onClick={p.onNext}>
            {p.verdict.finished ? '結果を見る' : '次の問題'}
          </button>
        </section>
      )}
    </div>
  )
}
