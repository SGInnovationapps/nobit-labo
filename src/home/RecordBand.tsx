import { bandSummary } from './homeModel'
import type { BandCell } from './homeModel'

type Props = {
  cells: ReadonlyArray<BandCell>
  /** 完了シートで、今日の棒を伸ばして見せる */
  animateToday?: boolean
}

/** 記録の帯：日ごとの完了タスク数を、棒の高さ 4 段階で並べる。休息日は紫、今日は枠 */
export function RecordBand({ cells, animateToday = false }: Props) {
  return (
    <div className="band" role="img" aria-label={bandSummary(cells)}>
      <div className="band-bars" aria-hidden="true">
        {cells.map((c) => (
          <span key={c.date} className={`band-slot${c.today ? ' is-today' : ''}`}>
            {c.kind === 'done' && (
              <i className={`bar bar-${c.level}${c.today && animateToday ? ' grow' : ''}`} />
            )}
            {c.kind === 'rest' && <i className="bar bar-rest" />}
          </span>
        ))}
      </div>
      <div className="band-axis" aria-hidden="true">
        <span>{cells.length}日前</span>
        <span>今日</span>
      </div>
    </div>
  )
}
