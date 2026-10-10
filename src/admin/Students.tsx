import { useCallback, useEffect, useState } from 'react'
import { RecordBand } from '../home/RecordBand'
import { buildBand, jstDate } from '../home/homeModel'
import { gradeLabel } from '../lib/steps'
import { loadStudentBoard } from './adminApi'
import type { StudentBoard } from './adminApi'
import {
  attentionOf, buildScaledBand, countStates, filterStudents, lastStudyLabel, sortByAttention, STATE_TEXT, stateOf,
} from './studentModel'
import type { Filter, StudentRow } from './studentModel'

type ViewProps = {
  board: StudentBoard
  today: string
  onOpen: (s: StudentRow) => void
}

export function StudentsView({ board, today, onOpen }: ViewProps) {
  const [filter, setFilter] = useState<Filter>('any')
  const [query, setQuery] = useState('')
  const attOpts = { gapRule: board.gapRule, restDates: board.eventDates }
  const counts = countStates(board.students)
  const list = filterStudents(sortByAttention(board.students, today, attOpts), filter, query)
  const total = board.students.length
  const clubCells = buildScaledBand(board.clubActivity, today, 14)
  const clubTotal = board.clubActivity.reduce((n, a) => n + a.count, 0)

  return (
    <>
      <div className="adm-title-row">
        <h1 className="adm-h1">生徒一覧</h1>
      </div>

      <section className="adm-summary" aria-label="今日の状態">
        <div className="adm-stat-row">
          {[
            { key: 'none' as const, label: STATE_TEXT.none },
            { key: 'partial' as const, label: STATE_TEXT.partial },
            { key: 'all' as const, label: STATE_TEXT.all },
          ].map((x) => (
            <button
              key={x.key}
              type="button"
              className="adm-stat"
              aria-pressed={filter === x.key}
              onClick={() => setFilter(filter === x.key ? 'any' : x.key)}
            >
              <span className="adm-stat-label">{x.label}</span>
              <span className="num adm-stat-num">{counts[x.key]}</span>
              <span className="adm-stat-unit">人</span>
            </button>
          ))}
        </div>
        <div className="adm-club-band">
          <p className="adm-sub">クラブ全体の完了タスク（直近14日）　<span className="num adm-strong">{clubTotal}</span> 件</p>
          <RecordBand cells={clubCells} />
        </div>
      </section>

      <div className="adm-toolbar">
        <div className="field adm-search">
          <label htmlFor="stu-search">名前で探す</label>
          <input id="stu-search" type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="表示名の一部" />
        </div>
        <p className="adm-sub adm-toolbar-note" role="status">
          <span>{filter === 'any' ? `${total}人` : `${STATE_TEXT[filter]} ${list.length}人`}</span>
          {query.trim() && <span>（「{query.trim()}」で絞り込み）</span>}
          <span>対応が必要な順に並べています</span>
        </p>
      </div>

      {total === 0 ? (
        <p className="muted">承認済みの生徒は、まだいません。「所属の承認」から承認してください。</p>
      ) : list.length === 0 ? (
        <p className="muted">条件に合う生徒はいません。</p>
      ) : (
        <ul className="adm-list">
          {list.map((s) => {
            const state = stateOf(s)
            const attention = attentionOf(s, today, attOpts)
            return (
              <li className="adm-row adm-student-row" key={s.userId}>
                <div className="adm-row-main">
                  <p className="adm-name">
                    {s.displayName ?? '（表示名が未入力）'}
                    <span className="adm-grade">{s.grade !== null ? gradeLabel(s.grade) : ''}</span>
                  </p>
                  {attention.reason && attention.rank <= 1 && <p className="adm-blocker">{attention.reason}</p>}
                  <dl className="adm-meta">
                    <div>
                      <dt>今日</dt>
                      <dd>
                        <span className={`adm-state adm-state-${state}`}>{STATE_TEXT[state]}</span>
                        {s.assignedTotal > 0 && <span className="num adm-today-count"> {s.assignedDone} / {s.assignedTotal}</span>}
                      </dd>
                    </div>
                    <div>
                      <dt>連続</dt>
                      <dd><span className="num">{s.currentDays}</span> 日</dd>
                    </div>
                    <div>
                      <dt>最長</dt>
                      <dd><span className="num">{s.longestDays}</span> 日</dd>
                    </div>
                    <div>
                      <dt>最終学習</dt>
                      <dd>{lastStudyLabel(s.lastAchievedDate, today)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="adm-student-band">
                  <RecordBand cells={buildBand(s.activity, today, 14, board.restDates)} />
                </div>
                <div className="adm-row-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => onOpen(s)}>
                    詳細・応援<span className="adm-sr">（{s.displayName ?? '表示名が未入力'}）</span>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export default function StudentsPage({ clubId, onOpen }: { clubId: string; onOpen: (s: StudentRow) => void }) {
  const [board, setBoard] = useState<StudentBoard | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setBoard(await loadStudentBoard(clubId, jstDate(Date.now())))
      setLoadError(null)
    } catch (e) {
      console.error(e)
      setLoadError('読み込めませんでした。通信を確認して、もう一度お試しください。')
    }
  }, [clubId])

  useEffect(() => {
    setBoard(null)
    void load()
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  if (loadError) {
    return (
      <>
        <p className="error" role="alert">{loadError}</p>
        <button type="button" className="btn btn-secondary adm-inline" onClick={() => void load()}>もう一度読み込む</button>
      </>
    )
  }
  if (!board) return <p className="muted" role="status">読み込み中…</p>
  return <StudentsView board={board} today={jstDate(Date.now())} onOpen={onOpen} />
}
