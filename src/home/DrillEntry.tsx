import { DRILL_SUBJECTS, DRILL_TOTAL, GRADE_CHOICES, sortUnits, unitLevel, unitState } from './drillModel'
import type { DrillMode, DrillSubject, DrillUnit } from './drillModel'

type Props = {
  subject: DrillSubject
  gradeMax: number
  units: ReadonlyArray<DrillUnit>
  wrongCount: number
  loading: boolean
  busy: boolean
  error: string | null
  onSubject: (s: DrillSubject) => void
  onGrade: (g: number) => void
  onStart: (mode: DrillMode, category: string | null) => void
  onClose: () => void
}

/**
 * ドリルの入口（画面A・B）：教科 → 出題の範囲 → おまかせ／まちがえた問題／単元。
 * 単元は、解いたことのあるものを先に、正解率の低い順に出す。
 */
export function DrillEntry(p: Props) {
  const units = sortUnits(p.units)
  const solved = units.filter((u) => u.tried > 0)

  return (
    <div className="drill">
      <header className="drill-head">
        <h1 className="drill-title">ドリル</h1>
        <button type="button" className="pick-close" onClick={p.onClose}>閉じる</button>
      </header>
      <p className="pick-sub">四択を<span className="num">{DRILL_TOTAL}</span>問。解き終えると、その教科の記録になります。</p>

      <div className="drill-subjects" role="tablist" aria-label="教科">
        {DRILL_SUBJECTS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === p.subject}
            className={s === p.subject ? 'drill-sub is-on' : 'drill-sub'}
            disabled={p.busy}
            onClick={() => p.onSubject(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="drill-grades" role="group" aria-label="出題の範囲">
        {GRADE_CHOICES.map((g) => (
          <button
            key={g.value}
            type="button"
            aria-pressed={g.value === p.gradeMax}
            className={g.value === p.gradeMax ? 'drill-grade is-on' : 'drill-grade'}
            disabled={p.busy}
            onClick={() => p.onGrade(g.value)}
          >
            {g.label}
          </button>
        ))}
      </div>

      {p.error && <p className="error" role="alert">{p.error}</p>}

      <button type="button" className="drill-start" disabled={p.busy || p.loading} onClick={() => p.onStart('mixed', null)}>
        <span className="drill-start-label">おまかせで<span className="num">{DRILL_TOTAL}</span>問</span>
        <span className="drill-start-note">{p.subject}のぜんぶから</span>
      </button>

      <button
        type="button"
        className="drill-wrong"
        disabled={p.busy || p.loading || p.wrongCount === 0}
        onClick={() => p.onStart('wrong', null)}
      >
        <span className="drill-start-label">まちがえた問題</span>
        <span className="drill-start-note">
          {p.loading ? '読み込み中' : p.wrongCount === 0 ? 'いまはありません' : <><span className="num">{p.wrongCount}</span>問</>}
        </span>
      </button>

      <section className="section" aria-labelledby="drill-units-h">
        <div className="today-head">
          <h2 id="drill-units-h">単元を選ぶ</h2>
          <span className="rec-count"><span className="num">{solved.length}</span> / <span className="num">{units.length}</span> 単元</span>
        </div>
        {p.loading ? (
          <p className="muted">読み込み中…</p>
        ) : units.length === 0 ? (
          <p className="muted">この範囲の問題は、まだ用意されていません。</p>
        ) : (
          <ul className="drill-units">
            {units.map((u) => (
              <li key={u.category}>
                <button type="button" className="drill-unit" disabled={p.busy} onClick={() => p.onStart('unit', u.category)}>
                  <span className="drill-unit-main">
                    <span className="drill-unit-name">{u.category}</span>
                    <span className="drill-unit-sub">
                      {u.tried > 0 ? (
                        <><span className="num">{u.correct}</span> / <span className="num">{u.tried}</span>　正解率 <span className="num">{u.percent}</span>%</>
                      ) : (
                        <><span className="num">{u.questions}</span>問</>
                      )}
                    </span>
                  </span>
                  <span className={`drill-unit-bar lv${unitLevel(u)}`} aria-hidden="true"><i /></span>
                  <span className="drill-unit-state">{unitState(u)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
