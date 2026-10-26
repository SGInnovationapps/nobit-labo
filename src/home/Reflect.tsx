import { useCallback, useEffect, useState } from 'react'
import { jstDate } from './homeModel'
import { TabBar } from './TabBar'
import type { Tab } from './TabBar'
import { loadReflect } from './reflectApi'
import type { ReflectData } from './reflectApi'
import { weekHistorySummary, weekRangeLabel } from './weekModel'
import { calendarCells, minutesLabel, periodOf, questSummaryOf, shiftAnchor, summarize, ticketLine } from './reflectModel'
import { QUEST_NAME } from './homeModel'
import type { TrendPoint } from './reflectModel'
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
  const cells = data ? calendarCells(period, data.activity, data.today, data.restDates) : []
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

          <section className="section" aria-labelledby="trend-h">
            <h2 id="trend-h">連続記録の推移</h2>
            <Trend points={data.trend} />
            <p className="muted trend-note">各週の終わりの連続日数です（直近12週）。休息日は日数を変えません。</p>
          </section>

          {data.tickets && (
            <section className="section" aria-labelledby="tk-h">
              <h2 id="tk-h">休息チケット</h2>
              <p>{ticketLine(data.tickets.balance, data.tickets.usedInPeriod, unit)}</p>
              <p className="muted">使った日は休息日（紫）になり、学習日には数えません。</p>
            </section>
          )}

          <section className="section" aria-labelledby="qz-h">
            <h2 id="qz-h">デイリークエスト</h2>
            {data.quests.length === 0 ? (
              <p className="muted">この{unit}の達成は、まだありません。</p>
            ) : (
              <>
                <dl className="sum-list">
                  <div><dt>達成した日</dt><dd><span className="num">{questSummaryOf(data.quests).days}</span>日</dd></div>
                  <div><dt>全部達成した日</dt><dd><span className="num">{questSummaryOf(data.quests).allDays}</span>日</dd></div>
                  <div><dt>もらったコイン</dt><dd><span className="num">{questSummaryOf(data.quests).coins}</span></dd></div>
                </dl>
                <ul className="quest-hist">
                  {[...data.quests].reverse().map((q) => (
                    <li key={q.date} className="quest-hist-row">
                      <span className="quest-hist-date num">{Number(q.date.slice(5, 7))}/{Number(q.date.slice(8, 10))}</span>
                      <span className="quest-hist-names">
                        {q.keys.filter((k) => k !== 'all').map((k) => QUEST_NAME[k as keyof typeof QUEST_NAME] ?? k).join('、')}
                        {q.keys.includes('all') && <span className="quest-hist-all">全部達成</span>}
                      </span>
                      <span className="quest-hist-coins num">{q.coins}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="section" aria-labelledby="wk-h">
            <h2 id="wk-h">週の目標</h2>
            {data.weeks.length === 0 ? (
              <p className="muted">この{unit}の週の記録は、まだありません。</p>
            ) : (
              <>
                <dl className="sum-list">
                  <div><dt>目標を達成した週</dt><dd><span className="num">{weekHistorySummary(data.weeks).achieved}</span> / <span className="num">{data.weeks.length}</span>週</dd></div>
                  <div><dt>同じ教科を週3日</dt><dd><span className="num">{weekHistorySummary(data.weeks).subjectQuests}</span>回</dd></div>
                </dl>
                <ul className="quest-hist">
                  {[...data.weeks].reverse().map((w) => (
                    <li key={w.weekStart} className="quest-hist-row">
                      <span className="quest-hist-date week-hist-range num">{weekRangeLabel(w.weekStart)}</span>
                      <span className="quest-hist-names">
                        <span className="num">{w.studyDays}</span> / <span className="num">{w.targetDays}</span>日
                        {w.subjectQuestSubject && <>　{w.subjectQuestSubject}を週3日</>}
                      </span>
                      {/* 届かなかった週は空けておく（責めない） */}
                      <span className="week-hist-state">{w.goalAchieved ? '達成' : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
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

/** 週ごとの連続日数の棒。数字を主役にし、棒は高さの目安 */
function Trend({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.days))
  return (
    <ol className="trend" aria-label="週ごとの連続日数">
      {points.map((p, i) => {
        const last = i === points.length - 1
        const md = `${Number(p.weekStart.slice(5, 7))}/${Number(p.weekStart.slice(8, 10))}`
        return (
          <li key={p.weekStart} className={`trend-col${last ? ' is-now' : ''}`} aria-label={`${md}の週 ${p.days}日${last ? '（今週）' : ''}`}>
            <span className="trend-n num">{p.days}</span>
            <span className="trend-bar" aria-hidden="true"><i style={{ height: `${Math.max(p.days > 0 ? 6 : 2, (p.days / max) * 64)}px` }} /></span>
            <span className="trend-d num" aria-hidden="true">{i % 3 === 0 || last ? md : ''}</span>
          </li>
        )
      })}
    </ol>
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
