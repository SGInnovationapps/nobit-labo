import { useCallback, useEffect, useState } from 'react'
import { buildBand, dateLabel, jstDate, timeLabel } from '../home/homeModel'
import { RecordBand } from '../home/RecordBand'
import { gradeLabel } from '../lib/steps'
import { addSupportComment, deleteSupportComment, loadStudentDetail } from './adminApi'
import type { StudentDetail } from './adminApi'
import { COMMENT_MAX, commentError, lastStudyLabel, monthDays, STATE_TEXT, stateOf, subjectBreakdown, weeklyDays } from './studentModel'

type ViewProps = {
  detail: StudentDetail
  today: string
  /** クラブ管理者だけが、アプリ内の応援を書ける。運営は読むだけ */
  canComment: boolean
  busy: boolean
  error: string | null
  onBack: () => void
  onSend: (body: string) => void
  onDelete: (id: string) => void
}

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

export function StudentDetailView({ detail, today, canComment, busy, error, onBack, onSend, onDelete }: ViewProps) {
  const { student: s } = detail
  const [body, setBody] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const state = stateOf(s)
  const weeks = weeklyDays(detail.studyDates, today, 12)
  const subjects = subjectBreakdown(detail.subjects)
  const cells = buildBand(s.activity, today, 14)

  return (
    <>
      <button type="button" className="btn btn-quiet adm-back" onClick={onBack}>生徒一覧にもどる</button>

      <div className="adm-title-row">
        <h1 className="adm-h1">
          {s.displayName ?? '（表示名が未入力）'}
          <span className="adm-grade">{s.grade !== null ? gradeLabel(s.grade) : ''}</span>
        </h1>
        <span className={`adm-state adm-state-${state}`}>今日　{STATE_TEXT[state]}</span>
      </div>

      <dl className="adm-bigstats">
        <div><dt>連続記録</dt><dd><span className="num">{s.currentDays}</span><span className="adm-unit">日</span></dd></div>
        <div><dt>最長記録</dt><dd><span className="num">{s.longestDays}</span><span className="adm-unit">日</span></dd></div>
        <div><dt>今月の学習日</dt><dd><span className="num">{monthDays(detail.studyDates, today)}</span><span className="adm-unit">日</span></dd></div>
        <div><dt>最終学習</dt><dd className="adm-text-stat">{lastStudyLabel(s.lastAchievedDate, today)}</dd></div>
      </dl>

      <section className="adm-section" aria-labelledby="d-band">
        <h2 id="d-band">直近14日の記録</h2>
        <RecordBand cells={cells} />
      </section>

      <section className="adm-section" aria-labelledby="d-weeks">
        <h2 id="d-weeks">12週の学習記録</h2>
        <p className="adm-sub">1週間（月〜日）のうち、学習した日の数です。</p>
        <div className="adm-weeks" role="img" aria-label={`直近12週の学習日数：${weeks.map((w) => w.days).join('、')}`}>
          {weeks.map((w, i) => (
            <div className="adm-week" key={w.start} aria-hidden="true">
              <span className="adm-week-slot"><i className={`bar bar-${w.level || 'none'}`} /></span>
              <span className="num adm-week-n">{w.days}</span>
              <span className="adm-week-d">{i === 0 || i === 11 || i === 6 ? md(w.start) : ''}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="adm-section" aria-labelledby="d-subj">
        <h2 id="d-subj">教科別の完了（直近30日）</h2>
        {subjects.length === 0 ? (
          <p className="muted">まだ記録がありません。</p>
        ) : (
          <ul className="adm-subjects">
            {subjects.map((x) => (
              <li key={x.subject}>
                <span className="adm-subject-name">{x.subject}</span>
                <span className="adm-subject-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, x.ratio * 100)}%` }} /></span>
                <span className="num adm-subject-n">{x.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="adm-sub">運営が配信したタスクだけの集計です。自由登録の内容は含みません。</p>
      </section>

      <section className="adm-section" aria-labelledby="d-hist">
        <h2 id="d-hist">学習履歴</h2>
        {detail.history.length === 0 ? (
          <p className="muted">完了したタスクは、まだありません。</p>
        ) : (
          <ul className="adm-list adm-list-compact">
            {detail.history.slice(0, 20).map((h) => (
              <li className="adm-row adm-row-compact adm-history-row" key={h.id}>
                <p className="adm-sub num">{dateLabel(jstDate(h.completedAt))}　{timeLabel(h.completedAt)}</p>
                <p className="adm-name adm-history-title">{h.title}</p>
                <p className="adm-sub">{h.subject}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="adm-section" aria-labelledby="d-support">
        <h2 id="d-support">応援</h2>
        {canComment ? (
          <form
            className="adm-comment-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              const err = commentError(body)
              setShown(err)
              if (!err) {
                onSend(body)
                setBody('')
              }
            }}
          >
            <div className="field">
              <label htmlFor="support-body">
                生徒に届く、アプリ内のコメント
                <span className="count"><span className="num">{body.trim().length}</span> / <span className="num">{COMMENT_MAX}</span></span>
              </label>
              <textarea id="support-body" rows={3} value={body} maxLength={COMMENT_MAX + 50} placeholder="例：今週も続けているね。数学の文章題、がんばっていました。" onChange={(e) => setBody(e.target.value)} />
              {shown && <p className="error">{shown}</p>}
            </div>
            <button type="submit" className="btn btn-primary adm-inline" disabled={busy}>{busy ? '送っています…' : '応援を送る'}</button>
          </form>
        ) : (
          <p className="muted">運営からの連絡は、公式LINE のチャットから1人ずつ送ります（連絡済みの記録は、アラートの機能で追加します）。ここには、クラブ管理者の応援コメントが並びます。</p>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        {detail.comments.length === 0 ? (
          <p className="muted">応援コメントは、まだありません。</p>
        ) : (
          <ul className="adm-list">
            {detail.comments.map((c) => (
              <li className="adm-row adm-comment" key={c.id}>
                <div>
                  <p className="adm-sub num">{dateLabel(jstDate(c.createdAt))}　{timeLabel(c.createdAt)}</p>
                  <p className="adm-comment-body">{c.body}</p>
                </div>
                {c.mine && (
                  <div className="adm-row-actions">
                    {confirmingId === c.id ? (
                      <>
                        <p className="adm-confirm">このコメントを消します。</p>
                        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setConfirmingId(null); onDelete(c.id) }}>消す</button>
                        <button type="button" className="btn btn-quiet" onClick={() => setConfirmingId(null)}>やめる</button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-quiet" onClick={() => setConfirmingId(c.id)}>消す</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

type PageProps = { clubId: string; studentId: string; myId: string; canComment: boolean; onBack: () => void }

export default function StudentDetailPage({ clubId, studentId, myId, canComment, onBack }: PageProps) {
  const [detail, setDetail] = useState<StudentDetail | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setDetail(await loadStudentDetail(clubId, studentId, jstDate(Date.now()), myId))
      setLoadError(null)
    } catch (e) {
      console.error(e)
      setLoadError('読み込めませんでした。通信を確認して、もう一度お試しください。')
    }
  }, [clubId, studentId, myId])

  useEffect(() => {
    setDetail(undefined)
    void load()
  }, [load])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      await load()
    } catch (e) {
      console.error(e)
      setActionError('処理できませんでした。通信を確認して、もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <>
        <p className="error" role="alert">{loadError}</p>
        <button type="button" className="btn btn-secondary adm-inline" onClick={() => void load()}>もう一度読み込む</button>
        <button type="button" className="btn btn-quiet adm-back" onClick={onBack}>生徒一覧にもどる</button>
      </>
    )
  }
  if (detail === undefined) return <p className="muted" role="status">読み込み中…</p>
  if (detail === null) {
    return (
      <>
        <p className="lead">この生徒は、このクラブにいません。</p>
        <button type="button" className="btn btn-secondary adm-inline" onClick={onBack}>生徒一覧にもどる</button>
      </>
    )
  }

  return (
    <StudentDetailView
      detail={detail}
      today={jstDate(Date.now())}
      canComment={canComment}
      busy={busy}
      error={actionError}
      onBack={onBack}
      onSend={(body) => void run(() => addSupportComment(clubId, studentId, myId, body))}
      onDelete={(id) => void run(() => deleteSupportComment(id))}
    />
  )
}
