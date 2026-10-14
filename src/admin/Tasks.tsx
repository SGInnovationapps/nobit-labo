import { useCallback, useEffect, useState } from 'react'
import { jstDate } from '../home/homeModel'
import { archiveTask, createTasks, loadTaskBoard } from './adminApi'
import type { Club, TaskBoard } from './adminApi'
import {
  completionLabel, draftFromTask, dueToday, eligibleStudents, emptyDraft, gradesLabel, groupTasks, hasErrors, periodLabel, RECURRENCES, recurrenceLabel,
  STATUS_LABEL, SUBJECTS, TASK_COINS_MAX, TASK_GRADES, toggleGrade, validateDraft,
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
  /** 配信先に選べるクラブ。2つ以上あるときだけ、フォームにクラブの選択を出す */
  clubs: ReadonlyArray<{ id: string; name: string }>
  /** 作成フォームを開いているか。複製のときは、引き継いだ内容を初期値にする */
  creating: boolean
  initialDraft?: Draft
  duplicating?: boolean
  /** フォームを作り直したいとき（別のタスクを続けて複製したとき）に変える */
  formKey?: number
  onOpenCreate: () => void
  onCloseCreate: () => void
  onCreate: (draft: Draft) => void
  onDuplicate?: (t: AdminTask) => void
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

      {p.creating && (
        <TaskForm
          key={`${p.duplicating ? 'dup' : 'new'}-${p.formKey ?? 0}`}
          today={p.today} busy={p.busy} clubs={p.clubs} initial={p.initialDraft} duplicating={p.duplicating}
          onSubmit={p.onCreate} onCancel={p.onCloseCreate}
        />
      )}

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
                        <div><dt>対象</dt><dd>{gradesLabel(t.targetGrades)}</dd></div>
                        {t.rewardCoins !== undefined && <div><dt>報酬</dt><dd><span className="num">{t.rewardCoins}</span> コイン</dd></div>}
                        {t.estimatedMinutes !== null && <div><dt>目安</dt><dd><span className="num">{t.estimatedMinutes}</span> 分</dd></div>}
                        {status === 'active' && (
                          <div><dt>今日の完了</dt><dd className="num">{completionLabel(p.board.doneToday[t.id] ?? 0, eligibleStudents(t, p.board.studentGrades ?? []), dueToday(t, p.today))}</dd></div>
                        )}
                      </dl>
                    </div>
                    <div className="adm-row-actions">
                      {p.onDuplicate && !confirming && (
                        <button type="button" className="btn btn-secondary" onClick={() => p.onDuplicate!(t)}>複製する</button>
                      )}
                      {status !== 'ended' && (
                        <>
                        {confirming ? (
                          <>
                            <p className="adm-confirm">取り下げます。まだ完了していない今日の分も消えます。</p>
                            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setConfirmingId(null); p.onArchive(t) }}>取り下げる</button>
                            <button type="button" className="btn btn-quiet" onClick={() => setConfirmingId(null)}>やめる</button>
                          </>
                        ) : (
                          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setConfirmingId(t.id)}>取り下げる</button>
                        )}
                        </>
                      )}
                    </div>
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
  clubs: ReadonlyArray<{ id: string; name: string }>
  initial?: Draft
  duplicating?: boolean
  onSubmit: (d: Draft) => void
  onCancel: () => void
}

export function TaskForm({ today, busy, clubs, initial, duplicating = false, onSubmit, onCancel }: FormProps) {
  const [d, setD] = useState<Draft>(() => initial ?? emptyDraft(today))
  const pickClubs = clubs.length > 1
  const [shown, setShown] = useState<DraftErrors>({})
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  return (
    <form
      className="adm-form"
      aria-labelledby="adm-create-h"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const errors = validateDraft(d, today, pickClubs)
        setShown(errors)
        if (!hasErrors(errors)) onSubmit(d)
      }}
    >
      <h2 id="adm-create-h">{duplicating ? 'タスクを複製する' : 'タスクを作成する'}</h2>
      {duplicating && <p className="muted adm-hint">名前・教科・目安・くり返し・対象・報酬を引き継ぎました。開始日は今日にしています。</p>}

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

      <fieldset className="choices adm-choices-grade">
        <legend>配信する学年</legend>
        <label className="choice">
          <input type="checkbox" checked={d.grades.length === 0} onChange={() => set('grades', [])} />
          <span className="choice-face">全学年</span>
        </label>
        {TASK_GRADES.map((g) => (
          <label key={g.value} className="choice">
            <input type="checkbox" checked={d.grades.includes(g.value)} onChange={() => set('grades', toggleGrade(d.grades, g.value))} />
            <span className="choice-face">{g.label}</span>
          </label>
        ))}
      </fieldset>
      <p className="muted adm-hint">学年を選ぶと、その学年の生徒だけに出ます。選ばないときは全学年です。</p>

      {pickClubs && (
        <fieldset className="adm-club-pick">
          <legend>配信するクラブ（複数選べます）</legend>
          <div className="adm-actions-row">
            <button type="button" className="btn btn-quiet" onClick={() => set('clubIds', clubs.map((c) => c.id))}>すべて選ぶ</button>
            <button type="button" className="btn btn-quiet" onClick={() => set('clubIds', [])}>選びなおす</button>
          </div>
          {clubs.map((c) => (
            <label className="agree adm-all" key={c.id}>
              <input
                type="checkbox"
                checked={d.clubIds.includes(c.id)}
                onChange={(e) => set('clubIds', e.target.checked ? [...d.clubIds, c.id] : d.clubIds.filter((x) => x !== c.id))}
              />
              <span>{c.name}</span>
            </label>
          ))}
          {shown.clubs && <p className="error">{shown.clubs}</p>}
        </fieldset>
      )}

      <div className="field adm-coins">
        <label htmlFor="t-coins">報酬のコイン（0〜{TASK_COINS_MAX}）</label>
        <input id="t-coins" type="text" inputMode="numeric" value={d.coins} onChange={(e) => set('coins', e.target.value)} aria-invalid={!!shown.coins} />
        {shown.coins && <p className="error">{shown.coins}</p>}
      </div>

      <div className="adm-actions-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '作成中…' : pickClubs && d.clubIds.length > 1 ? `${d.clubIds.length}クラブに配信する` : '作成する'}</button>
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
  const [initialDraft, setInitialDraft] = useState<Draft | undefined>(undefined)
  const [duplicating, setDuplicating] = useState(false)
  const [formKey, setFormKey] = useState(0)
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
      // クラブを選ぶ画面（複数クラブ）では選んだクラブ、1クラブだけのときは表示中のクラブ
      const targets = clubs.length > 1 ? draft.clubIds : [club.id]
      await createTasks(targets, draft, userId)
      setCreating(false)
      setInitialDraft(undefined)
      setDuplicating(false)
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
      clubs={clubs}
      creating={creating}
      initialDraft={initialDraft}
      duplicating={duplicating}
      formKey={formKey}
      onOpenCreate={() => { setNotice(null); setDuplicating(false); setInitialDraft(emptyDraft(today, [club.id])); setCreating(true) }}
      onCloseCreate={() => { setCreating(false); setInitialDraft(undefined); setDuplicating(false) }}
      onCreate={(d) => void onCreate(d)}
      onDuplicate={(t) => { setNotice(null); setFormKey((k) => k + 1); setDuplicating(true); setInitialDraft(draftFromTask(t, today, [club.id])); setCreating(true); window.scrollTo({ top: 0 }) }}
      onArchive={(t) => void onArchive(t)}
    />
  )
}
