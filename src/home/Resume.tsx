import { RecordBand } from './RecordBand'
import { Nobit } from './Nobit'
import type { BandCell, HomeTask } from './homeModel'

type Props = {
  cells: ReadonlyArray<BandCell>
  longestDays: number
  badgeCount: number
  /** 今日のタスク（短い順に並べたもの） */
  tasks: ReadonlyArray<HomeTask>
  onStart: () => void
}

/** 画面08：連続記録が途切れたあと。責めず、過去の記録がそのまま残っていることを見せる */
export function ResumeView({ cells, longestDays, badgeCount, tasks, onStart }: Props) {
  return (
    <div className="resume">
      <Nobit mood="wave" className="resume-nobit" />
      <h1 className="resume-title">おかえり。また今日から。</h1>
      <p className="resume-sub">これまでの記録は、そのまま残っています。</p>

      <section className="resume-band" aria-label="これまでの記録">
        <RecordBand cells={cells} />
      </section>

      <dl className="resume-stats">
        <div>
          <dt>最長記録</dt>
          <dd><span className="num">{longestDays}</span><span className="resume-unit">日</span></dd>
        </div>
        <div>
          <dt>バッジ</dt>
          <dd><span className="num">{badgeCount}</span><span className="resume-unit">個</span></dd>
        </div>
      </dl>

      <section className="resume-tasks" aria-labelledby="resume-tasks-h">
        <h2 id="resume-tasks-h">今日、短く始められるタスク</h2>
        {tasks.length === 0 ? (
          <p className="muted">今日のタスクはまだありません。教科の記録やタイマーからも始められます。</p>
        ) : (
          <ul>
            {tasks.map((t) => (
              <li key={t.id}>
                <span className="resume-subject">{t.subject}</span>
                <span className="resume-task">{t.title}</span>
                {t.estimatedMinutes !== null && <span className="resume-min"><span className="num">{t.estimatedMinutes}</span>分</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" className="btn btn-primary" onClick={onStart}>今日のホームへ</button>
    </div>
  )
}
