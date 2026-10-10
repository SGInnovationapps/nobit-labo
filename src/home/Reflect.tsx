import { useCallback, useEffect, useState } from 'react'
import { jstDate } from './homeModel'
import { TabBar } from './TabBar'
import type { Tab } from './TabBar'
import { loadReflect } from './reflectApi'
import type { ReflectData } from './reflectApi'
import { calendarCells, minutesLabel, periodOf, shiftAnchor, summarize } from './reflectModel'
import type { CalendarCell, Period, ReflectMode } from './reflectModel'

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日']

type Props = { onTab: (tab: Tab) => void }

/** ふりかえり（06）：読み込みと期間の切り替え */
export function Reflect({ onTab }: Props) {
  const [mode, setMode] = useState<ReflectMode>('month')
  const [anchor, setAnchor] = useState(() => jstDate(Date.now()))
  const [data, setData] = useState<ReflectData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const period = periodOf(mode, anchor)

  const load = useCallback(async (p: Period) => {
    setError(null)
    try {
      setData(await loadReflect(p))
    } catch (e) {
      console.error(e)
      setError('読み込めませんでした。通信を確認して、もう一度お試しください。')
    }
  }, [])

  useEffect(() => {
    void load(periodOf(mode, anchor))
  }, [mode, anchor, load])

  return (
    <ReflectView
      period={period}
      data={data}
      error={error}
      onMode={(m) => { setMode(m); setData(null) }}
      onShift={(dir) => { setAnchor(shiftAnchor(mode, anchor, dir)); setData(null) }}
      onThis={() => { setAnchor(jstDate(Date.now())); setData(null) }}
      onTab={onTab}
    />
  )
}

type ViewProps = {
  period: Period
  data: ReflectData | null
  error: string | null
  onMode: (m: ReflectMode) => void
  onShift: (dir: -1 | 1) => void
  onThis: () => void
  onTab: (tab: Tab) => void
}

export function ReflectView(p: ViewProps) {
  const { period, data } = p
  const summary = data ? summarize(data.activity, data.tasks, data.records) : null
  const cells = data ? calendarCells(period, data.activity, data.today) : []
  const maxCount = summary ? Math.max(1, ...summary.subjects.map((s) => s.tasks + s.records)) : 1
  const unit = period.mode === 'month' ? '月' : '週'

  return (
    <div className="home reflect">
      <header className="home-head">
        <h1 className="brand">ふりかえり</h1>
      </header>

      <div className="mode-row" role="group" aria-label="表示する期間">
        {(['month', 'week'] as const).map((m) => (
          <button key={m} type="button" className={`mode-btn${period.mode === m ? ' is-on' : ''}`} aria-pressed={period.mode === m} onClick={() => p.onMode(m)}>
            {m === 'month' ? '月' : '週'}
          </button>
        ))}
      </div>

      <div className="period-row">
        <button type="button" className="period-btn" onClick={() => p.onShift(-1)}>前の{unit}</button>
        <p className="period-label num" aria-live="polite">{period.label}</p>
        <button type="button" className="period-btn" onClick={() => p.onShift(1)}>次の{unit}</button>
      </div>

      {p.error && <p className="error" role="alert">{p.error}</p>}
      {!data && !p.error && <p className="muted" role="status">読み込み中…</p>}

      {data && summary && (
        <>
          <section className="section" aria-label="カレンダー">
            <div className="cal-head" aria-hidden="true">
              {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className="cal-grid">
              {cells.map((c, i) => (c ? <Day key={c.date} cell={c} /> : <span key={`b${i}`} className="cal-blank" />))}
            </div>
            <p className="muted cal-legend">色が濃いほど、その日に完了したタスクが多い日です。日付だけの日は、記録がありません。</p>
          </section>

          <section className="section" aria-labelledby="sum-h">
            <h2 id="sum-h">この{unit}の記録</h2>
            <dl className="sum-list">
              <div><dt>学習した日</dt><dd><span className="num">{summary.studyDays}</span>日</dd></div>
              <div><dt>完了したタスク</dt><dd><span className="num">{summary.completedTasks}</span>件</dd></div>
              <div><dt>集中した時間</dt><dd>{minutesLabel(summary.timerMinutes)}</dd></div>
              <div><dt>連続記録</dt><dd><span className="num">{data.streak.current}</span>日（最長 <span className="num">{data.streak.longest}</span>日）</dd></div>
            </dl>
          </section>

          <section className="section" aria-labelledby="sub-h">
            <h2 id="sub-h">教科別</h2>
            {summary.subjects.length === 0 ? (
              <p className="muted">この{unit}の記録は、まだありません。</p>
            ) : (
              <ul className="sub-list">
                {summary.subjects.map((s) => (
                  <li key={s.subject}>
                    <div className="sub-top">
                      <span className="sub-name">{s.subject}</span>
                      <span className="sub-note">
                        タスク {s.tasks}件　記録 {s.records}回{s.minutes > 0 ? `　${minutesLabel(s.minutes)}` : ''}
                      </span>
                    </div>
                    <span className="sub-bar" aria-hidden="true"><i style={{ width: `${((s.tasks + s.records) / maxCount) * 100}%` }} /></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <TabBar current="ふりかえり" onSelect={p.onTab} />
    </div>
  )
}

function Day({ cell }: { cell: CalendarCell }) {
  const label =
    cell.kind === 'done' ? `${cell.date} ${cell.count}件完了`
    : cell.kind === 'rest' ? `${cell.date} 休息日`
    : cell.kind === 'future' ? `${cell.date}` : `${cell.date} 記録なし`
  return (
    <span className={`cal-day cal-${cell.kind}${cell.kind === 'done' ? ` lv-${cell.level}` : ''}${cell.today ? ' is-today' : ''}`} role="img" aria-label={label}>
      <span className="cal-num num">{cell.day}</span>
      {cell.kind === 'done' && <span className="cal-count">{cell.count}件</span>}
      {cell.kind === 'rest' && <span className="cal-count">休息</span>}
    </span>
  )
}
