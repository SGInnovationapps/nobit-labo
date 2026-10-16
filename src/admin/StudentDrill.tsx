import { useEffect, useState } from 'react'
import { Marked } from '../home/Marked'
import { unitLevel, unitState } from '../home/drillModel'
import { loadStudentDrill, loadStudentDrillDetail } from './adminApi'
import type { StudentDrill, StudentDrillDetail } from './adminApi'
import { drillLastLabel } from './studentModel'

type Props = { studentId: string }

/**
 * 生徒の詳細（画面10）の、ドリルの成績。運営のときだけ出す。
 * クラブ管理者が見られるのは、ドリルのタスクを完了した時刻までで、ここは出さない。
 */
export function StudentDrill({ studentId }: Props) {
  const [sum, setSum] = useState<StudentDrill | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [detail, setDetail] = useState<StudentDrillDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    loadStudentDrill(studentId).then(
      (r) => { if (live) { setSum(r); setError(null) } },
      (e) => { console.error(e); if (live) setError('ドリルの成績を読み込めませんでした') },
    )
    return () => { live = false }
  }, [studentId])

  useEffect(() => {
    if (subject === null) {
      setDetail(null)
      return
    }
    let live = true
    setDetail(null)
    loadStudentDrillDetail(studentId, subject).then(
      (r) => { if (live) { setDetail(r); setDetailError(null) } },
      (e) => { console.error(e); if (live) setDetailError('単元ごとの成績を読み込めませんでした') },
    )
    return () => { live = false }
  }, [studentId, subject])

  return (
    <section className="adm-section" aria-labelledby="d-drill">
      <h2 id="d-drill">ドリル</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {!error && sum === null && <p className="muted">読み込み中…</p>}
      {sum !== null && sum.answered === 0 && <p className="muted">まだ解いていません。</p>}

      {sum !== null && sum.answered > 0 && (
        <>
          <dl className="sum-list">
            <div><dt>解いた問題</dt><dd><span className="num">{sum.answered}</span> 問</dd></div>
            <div><dt>正解</dt><dd><span className="num">{sum.correct}</span> 問（<span className="num">{sum.percent}</span>%）</dd></div>
            <div><dt>解き終えた回数</dt><dd><span className="num">{sum.sessions}</span> 回{sum.abandoned > 0 && <>　途中でやめた <span className="num">{sum.abandoned}</span> 回</>}</dd></div>
            <div><dt>最後に解いた日</dt><dd>{drillLastLabel(sum.lastAt)}</dd></div>
          </dl>

          <div className="adm-drill-tabs" role="group" aria-label="教科">
            {sum.subjects.map((s) => (
              <button
                key={s.subject}
                type="button"
                aria-pressed={subject === s.subject}
                className={subject === s.subject ? 'adm-drill-tab is-on' : 'adm-drill-tab'}
                onClick={() => setSubject(subject === s.subject ? null : s.subject)}
              >
                {s.subject}　<span className="num">{s.correct}</span>/<span className="num">{s.answered}</span>　<span className="num">{s.percent}</span>%
              </button>
            ))}
          </div>

          {subject !== null && (
            <div className="adm-drill-detail">
              {detailError && <p className="error" role="alert">{detailError}</p>}
              {!detailError && detail === null && <p className="muted">読み込み中…</p>}
              {detail !== null && (
                <>
                  <h3 className="adm-h3">{detail.subject}　単元ごと</h3>
                  {detail.units.length === 0 ? (
                    <p className="muted">この教科は、まだ解いていません。</p>
                  ) : (
                    <ul className="adm-list adm-list-compact">
                      {detail.units.map((u) => (
                        <li className="adm-row adm-row-compact" key={u.category}>
                          <p className="adm-name">{u.category}</p>
                          <p className="adm-sub"><span className="num">{u.correct}</span>/<span className="num">{u.tried}</span>　<span className="num">{u.percent}</span>%</p>
                          <p className={`adm-sub adm-drill-state lv${unitLevel({ category: u.category, questions: u.tried, tried: u.tried, correct: u.correct, percent: u.percent })}`}>
                            {unitState({ category: u.category, questions: u.tried, tried: u.tried, correct: u.correct, percent: u.percent })}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <h3 className="adm-h3">いま、まちがえている問題</h3>
                  {detail.wrong.length === 0 ? (
                    <p className="muted">ありません。</p>
                  ) : (
                    <ul className="adm-list adm-list-compact">
                      {detail.wrong.map((w) => (
                        <li className="adm-row-stack" key={w.id}>
                          <p className="adm-sub">{w.category}　中<span className="num">{w.grade}</span></p>
                          <p className="adm-name adm-drill-q"><Marked text={w.body} /></p>
                          <p className="adm-sub">答え　<Marked text={w.answer} /></p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
