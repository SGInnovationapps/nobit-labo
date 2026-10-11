import { weekStudyDays, weekSummary } from './homeModel'
import type { WeekCell } from './homeModel'

type Props = {
  cells: ReadonlyArray<WeekCell>
  /** グラフの下の一文（再開・はじめての状態） */
  note?: string
}

/**
 * この7日間（ホーム）：棒の上に記録の数、下に曜日。高さは4段階（4件以上は同じ高さ）。
 * 休息日は薄い紫の棒に「休息」、記録なしは線だけ、今日は枠。できなかった日を責めない
 */
export function WeekChart({ cells, note }: Props) {
  const days = weekStudyDays(cells)
  return (
    <section className="section week" aria-labelledby="week-h">
      <div className="today-head">
        <h2 id="week-h">この7日間</h2>
        <span className="week-days">{days > 0 ? <>記録した日 <span className="num">{days}</span>日</> : 'これから'}</span>
      </div>
      <div className="week-chart" role="img" aria-label={weekSummary(cells)}>
        {cells.map((c) => (
          <div key={c.date} className={c.today ? 'week-col is-today' : 'week-col'} aria-hidden="true">
            <span className={c.kind === 'rest' ? 'week-cnt is-rest' : 'week-cnt num'}>
              {c.kind === 'done' ? c.count : c.kind === 'rest' ? '休息' : ''}
            </span>
            <i className={c.kind === 'done' ? `week-bar lv-${c.level}` : c.kind === 'rest' ? 'week-bar is-rest' : 'week-bar is-none'} />
            <span className="week-day">{c.weekday}</span>
          </div>
        ))}
      </div>
      {note && <p className="band-note">{note}</p>}
    </section>
  )
}
