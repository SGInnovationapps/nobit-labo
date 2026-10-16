import { modeLabel, recordedNote, resultCheer } from './drillModel'
import type { DrillRecorded, DrillSummary } from './drillApi'

type Props = {
  summary: DrillSummary
  /** 解き終えたときに返った、学習の記録の結果（途中でやめたときは null） */
  recorded: DrillRecorded | null
  busy: boolean
  error: string | null
  onAgain: () => void
  onClose: () => void
}

/** 結果（画面E）：正解数を主役に、まちがえた問題と、記録になったかを出す */
export function DrillResult({ summary, recorded, busy, error, onAgain, onClose }: Props) {
  const label = modeLabel(summary.mode, summary.category)

  return (
    <div className="drill drill-result">
      <header className="drill-head">
        <p className="drill-where">{summary.subject}　<span className="drill-mode">{label}</span></p>
      </header>

      <section className="drill-score" aria-label="結果">
        <p className="drill-score-main">
          <span className="num drill-score-num">{summary.correct}</span>
          <span className="drill-score-unit"> / {summary.answered}問 正解</span>
        </p>
        <p className="drill-score-cheer">{resultCheer(summary.correct, summary.answered)}</p>
      </section>

      <p className="drill-recorded" role="status">
        {recordedNote(recorded?.recorded ?? false, recorded?.via ?? null, summary.subject, recorded?.coinsGranted ?? 0)}
      </p>
      {recorded?.recorded && recorded.currentDays > 0 && (
        <p className="drill-streak">連続 <span className="num">{recorded.currentDays}</span>日</p>
      )}
      {recorded && recorded.newBadges.length > 0 && (
        <p className="drill-badges">新しいバッジ　{recorded.newBadges.map((b) => b.name).join('、')}</p>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {summary.missed.length > 0 && (
        <section className="section" aria-labelledby="drill-missed-h">
          <div className="today-head">
            <h2 id="drill-missed-h">まちがえた問題</h2>
            <span className="rec-count"><span className="num">{summary.missed.length}</span> 問</span>
          </div>
          <ul className="drill-missed">
            {summary.missed.map((m, i) => (
              <li key={i}>
                <p className="drill-missed-q">{m.question}</p>
                <p className="drill-missed-a">答え　{m.answer}</p>
                {m.explanation && <p className="drill-missed-note">{m.explanation}</p>}
              </li>
            ))}
          </ul>
          <p className="muted">まちがえた問題は、入口の「まちがえた問題」からもう一度出てきます。</p>
        </section>
      )}

      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onAgain}>もう10問</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>ホームにもどる</button>
      </div>
    </div>
  )
}
