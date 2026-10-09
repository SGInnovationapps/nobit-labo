import { useCallback, useEffect, useState } from 'react'
import { jstDate } from '../home/homeModel'
import { archiveTask, createTasks, loadTaskBoard } from './adminApi'
import type { Club, TaskBoard } from './adminApi'
import {
  completionLabel, dueToday, emptyDraft, groupTasks, hasErrors, periodLabel, RECURRENCES, recurrenceLabel,
  STATUS_LABEL, SUBJECTS, validateDraft,
} from './taskModel'
import type { AdminTask, Draft, DraftErrors, TaskStatus } from './taskModel'

type ViewProps = {
  clubName: string
  board: TaskBoard
  today: string
  error: string | null
  notice: string | null
  busy: boolean
  busyId: string | null
  /** 運営は複数クラブがあるときだけ「すべてのクラブ」を選べる */
  canAllClubs: boolean
  creating: boolean
  onOpenCreate: () => void
  onCloseCreate: () => void
  onCreate: (draft: Draft) => void
  onArchive: (t: AdminTask) => void
}

const ORDER: TaskStatus[] = ['active', 'scheduled', 'ended']
const EMPTY: Record<TaskStatus, string> = {
  active: '配信中のタスクはありません。',
  scheduled: '予定のタスクはありません。',
  ended: '終了したタスクはありません。',
}

export function TasksView(p: ViewProps) {
  const groups = groupTasks(p.board.tasks, p.today)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <>
      <div className="adm-title-row">
        <h1 className="adm-h1">タスク管理</h1>
        {!p.creating && (
          <button type="button" className="btn btn-primary adm-inline" onClick={p.onOpenCreate}>タスクを作成する</button>
        )}
      </div>
      <p className="muted">{p.clubName}に配信するタスクです。生徒は、アプリのホームを開いたときに、今日の分を受け取ります。</p>

      {p.notice && <p className="adm-notice" role="status">{p.notice}</p>}
      {p.error && <p className="error" role="alert">{p.error}</p>}

      {p.creating && <TaskForm today={p.today} busy={p.busy} canAllClubs={p.canAllClubs} onSubmit={p.onCreate} onCancel={p.onCloseCreate} />}

      {ORDER.map((status) => (
        <section className="adm-section" key={status} aria-labelledby={`adm-t-${status}`}>
          <h2 id={`adm-t-${status}`}>
            {STATUS_LABEL[status]} <span className="num adm-count">{groups[status].length}</span>
          </h2>
          {groups[status].length === 0 ? (
            <p className="muted">{EMPTY[status]}</p>
          ) : (
            <ul className="adm-list">
              {groups[status].map((t) => {
                const confirming = confirmingId === t.id
                const busy = p.busyId === t.id
                return (
                  <li className="adm-row adm-task-row" key={t.id}>
                    <div className="adm-row-main">
                      <p className="adm-sub">{t.subject}</p>
                      <p className="adm-name">{t.title}</p>
                      <dl className="adm-meta">
                        <div><dt>期間</dt><dd className="num">{periodLabel(t)}</dd></div>
                        <div><dt>くり返し</dt><dd>{recurrenceLabel(t)}</dd></div>
                        {t.estimatedMinutes !== null && <div><dt>目安</dt><dd><span className="num">{t.estimatedMinutes}</span> 分</dd></div>}
                        {status === 'active' && (
                          <div><dt>今日の完了</dt><dd className="num">{completionLabel(p.board.doneToday[t.id] ?? 0, p.board.students, dueToday(t, p.today))}</dd></div>
                        )}
                      </dl>
                    </div>
                    {status !== 'ended' && (
                      <div className="adm-row-actions">
                        {confirming ? (
                          <>
                            <p className="adm-confirm">取り下げます。まだ完了していない今日の分も消えます。</p>
                            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setConfirmingId(null); p.onArchive(t) }}>取り下げる</button>
                            <button type="button" className="btn btn-quiet" onClick={() => setConfirmingId(null)}>やめる</button>
                          </>
                        ) : (
                          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setConfirmingId(t.id)}>取り下げる</button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
    </>
  )
}

type FormProps = {
  today: string
  busy: boolean
  canAllClubs: boolean
  onSubmit: (d: Draft) => void
  onCancel: () => void
}

export function TaskForm({ today, busy, canAllClubs, onSubmit, onCancel }: FormProps) {
  const [d, setD] = useState<Draft>(() => emptyDraft(today))
  const [shown, setShown] = useState<DraftErrors>({})
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  return (
    <form
      className="adm-form"
      aria-labelledby="adm-create-h"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const errors = validateDraft(d, today)
        setShown(errors)
        if (!hasErrors(errors)) onSubmit(d)
      }}
    >
      <h2 id="adm-create-h">タスクを作成する</h2>

      <div className="field">
        <label htmlFor="t-title">タスクの名前</label>
        <input id="t-title" type="text" maxLength={60} value={d.title} placeholder="例：英単語 Unit 3 の確認テスト" onChange={(e) => set('title', e.target.value)} aria-invalid={!!shown.title} />
        {shown.title && <p className="error">{shown.title}</p>}
      </div>

      <fieldset className="choices choices-5 adm-choices-5">
        <legend>教科</legend>
        {SUBJECTS.map((s) => (
          <label key={s} className="choice">
            <input type="radio" name="t-subject" checked={d.subject === s} onChange={() => set('subject', s)} />
            <span className="choice-face">{s}</span>
          </label>
        ))}
      </fieldset>
      {shown.subject && <p className="error">{shown.subject}</p>}

      <div className="adm-form-grid">
        <div className="field">
          <label htmlFor="t-start">開始日</label>
          <input id="t-start" type="date" min={today} value={d.startsOn} onChange={(e) => set('startsOn', e.target.value)} />
          {shown.startsOn && <p className="error">{shown.startsOn}</p>}
        </div>
        <div className="field">
          <label htmlFor="t-due">期限日（なくてもかまいません）</label>
          <input id="t-due" type="date" min={d.startsOn || today} value={d.dueOn} onChange={(e) => set('dueOn', e.target.value)} />
          {shown.dueOn && <p className="error">{shown.dueOn}</p>}
        </div>
        <div className="field">
          <label htmlFor="t-min">目安時間（分）</label>
          <input id="t-min" type="text" inputMode="numeric" value={d.minutes} placeholder="例：15" onChange={(e) => set('minutes', e.target.value)} />
          {shown.minutes && <p className="error">{shown.minutes}</p>}
        </div>
      </div>

      <fieldset className="choices adm-choices-rec">
        <legend>くり返し</legend>
        {RECURRENCES.map((r) => (
          <label key={r.value} className="choice">
            <input type="radio" name="t-rec" checked={d.recurrence === r.value} onChange={() => set('recurrence', r.value)} />
            <span className="choice-face">{r.label}</span>
          </label>
        ))}
      </fieldset>
      <p className="muted adm-hint">
        「なし」は、開始日の1日だけ（期限日があれば、そこまで。完了したら出ません）。「毎週」は、開始日と同じ曜日に出ます。
      </p>

      {canAllClubs && (
        <label className="agree adm-all">
          <input type="checkbox" checked={d.allClubs} onChange={(e) => set('allClubs', e.target.checked)} />
          <span>すべてのクラブに配信する</span>
        </label>
      )}

      <p className="muted adm-hint">報酬のコインは、Phase 2 から設定できるようになります。</p>

      <div className="adm-actions-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '作成中…' : '作成する'}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>やめる</button>
      </div>
    </form>
  )
}

type PageProps = { club: Club; clubs: Club[]; userId: string }

const ERROR = '処理できませんでした。通信を確認して、もう一度お試しください。'

export default function TasksPage({ club, clubs, userId }: PageProps) {
  const [board, setBoard] = useState<TaskBoard | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const today = jstDate(Date.now())

  const load = useCallback(async () => {
    try {
      setBoard(await loadTaskBoard(club.id, jstDate(Date.now())))
      setLoadError(null)
    } catch (e) {
      console.error(e)
      setLoadError('読み込めませんでした。通信を確認して、もう一度お試しください。')
    }
  }, [club.id])

  useEffect(() => {
    setBoard(null)
    setError(null)
    setNotice(null)
    setCreating(false)
    void load()
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function onCreate(draft: Draft) {
    setBusy(true)
    setError(null)
    try {
      const targets = draft.allClubs ? clubs.map((c) => c.id) : [club.id]
      await createTasks(targets, draft, userId)
      setCreating(false)
      setNotice(targets.length > 1 ? `${targets.length}クラブに配信しました。` : '配信しました。')
      await load()
    } catch (e) {
      console.error(e)
      setError(ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function onArchive(t: AdminTask) {
    setBusyId(t.id)
    setError(null)
    try {
      await archiveTask(t.id, jstDate(Date.now()))
      setNotice('取り下げました。')
    } catch (e) {
      console.error(e)
      setError(ERROR)
    } finally {
      setBusyId(null)
      await load()
    }
  }

  if (loadError) {
    return (
      <>
        <p className="error" role="alert">{loadError}</p>
        <button type="button" className="btn btn-secondary adm-inline" onClick={() => void load()}>もう一度読み込む</button>
      </>
    )
  }
  if (!board) return <p className="muted" role="status">読み込み中…</p>

  return (
    <TasksView
      clubName={club.name}
      board={board}
      today={today}
      error={error}
      notice={notice}
      busy={busy}
      busyId={busyId}
      canAllClubs={clubs.length > 1}
      creating={creating}
      onOpenCreate={() => { setNotice(null); setCreating(true) }}
      onCloseCreate={() => setCreating(false)}
      onCreate={(d) => void onCreate(d)}
      onArchive={(t) => void onArchive(t)}
    />
  )
}
