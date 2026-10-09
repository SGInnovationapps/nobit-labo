import { useCallback, useEffect, useState } from 'react'
import { CompletionSheet } from './CompletionSheet'
import { FreeTaskSheet } from './FreeTaskSheet'
import { RecordBand } from './RecordBand'
import { TabBar } from './TabBar'
import { completeTask, FreeTaskError, loadHome, registerFreeTask } from './homeApi'
import type { CompleteResult, HomeData } from './homeApi'
import { buildBand, cheerOf, dateLabel, dayState, sortTasks, STATE_LABEL, timeLabel } from './homeModel'

type Props = { clubId: string; clubName: string | null; displayName: string | null }

const FREE_ERRORS: Record<string, string> = {
  daily_limit_reached: '今日の自由登録は、3件までです。',
  free_tasks_disabled: 'このクラブでは、自由登録を使えません。',
}

/** 01 ホーム・今日のクエスト（Phase 1：連続記録・記録の帯・今日のタスク・自由登録） */
export function Home({ clubId, clubName, displayName }: Props) {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [done, setDone] = useState<{ title: string; result: CompleteResult } | null>(null)
  const [freeOpen, setFreeOpen] = useState(false)
  const [freeBusy, setFreeBusy] = useState(false)
  const [freeError, setFreeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await loadHome(clubId))
      setError(null)
    } catch (e) {
      console.error(e)
      setError('読み込めませんでした。通信を確認して、もう一度お試しください。')
    }
  }, [clubId])

  useEffect(() => {
    void load()
    // 別の画面から戻ったとき、運営が配信したタスクを受け取り直す
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function onComplete(id: string, title: string) {
    setPending(id)
    try {
      const result = await completeTask(id)
      await load()
      setDone({ title, result })
    } catch (e) {
      console.error(e)
      setError('記録できませんでした。通信を確認して、もう一度お試しください。')
    } finally {
      setPending(null)
    }
  }

  async function onFree(title: string, subject: string) {
    setFreeBusy(true)
    setFreeError(null)
    try {
      await registerFreeTask(title, subject, null)
      await load()
      setFreeOpen(false)
    } catch (e) {
      const code = e instanceof FreeTaskError ? e.code : ''
      setFreeError(FREE_ERRORS[code] ?? '保存できませんでした。通信を確認して、もう一度お試しください。')
    } finally {
      setFreeBusy(false)
    }
  }

  if (!data) {
    return (
      <div className="home">
        {error ? (
          <>
            <p className="error" role="alert">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>もう一度読み込む</button>
          </>
        ) : (
          <p className="muted" role="status">読み込み中…</p>
        )}
      </div>
    )
  }

  return (
    <HomeView
      data={data}
      clubName={clubName}
      displayName={displayName}
      error={error}
      pending={pending}
      done={done}
      freeOpen={freeOpen}
      freeBusy={freeBusy}
      freeError={freeError}
      onComplete={(id, title) => void onComplete(id, title)}
      onCloseDone={() => setDone(null)}
      onOpenFree={() => { setFreeError(null); setFreeOpen(true) }}
      onCloseFree={() => setFreeOpen(false)}
      onSubmitFree={(t, sub) => void onFree(t, sub)}
    />
  )
}

export type HomeViewProps = {
  data: HomeData
  clubName: string | null
  displayName: string | null
  error: string | null
  pending: string | null
  done: { title: string; result: CompleteResult } | null
  freeOpen: boolean
  freeBusy: boolean
  freeError: string | null
  onComplete: (id: string, title: string) => void
  onCloseDone: () => void
  onOpenFree: () => void
  onCloseFree: () => void
  onSubmitFree: (title: string, subject: string) => void
}

export function HomeView(p: HomeViewProps) {
  const { data, clubName, displayName, error, pending, done, freeOpen, freeBusy, freeError } = p
  const tasks = sortTasks(data.tasks)
  const state = dayState(tasks)
  const cells = buildBand(data.activity, data.today)

  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">NOBIT!</div>
        <p className="muted home-sub">{dateLabel(data.today)}　{clubName ?? ''}{displayName ? `　${displayName}` : ''}</p>
      </header>

      <section className="streak" aria-label="連続記録">
        <p className="streak-main"><span className="num streak-num">{data.streak.current}</span><span className="streak-unit">日連続</span></p>
        <p className="streak-sub">最長記録 <span className="num">{data.streak.longest}</span> 日</p>
      </section>

      <section className="section" aria-label="記録の帯">
        <RecordBand cells={cells} />
      </section>

      <p className="cheer"><span className="cheer-name">ノビット</span>{cheerOf(tasks)}</p>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="section" aria-labelledby="today-h">
        <div className="today-head">
          <h2 id="today-h">今日のタスク</h2>
          <span className={`state state-${state}`}>{STATE_LABEL[state]}</span>
        </div>
        {tasks.length === 0 ? (
          <p className="muted">配信されたタスクは、まだありません。</p>
        ) : (
          <ul className="tasks">
            {tasks.map((t) => (
              <li key={t.id} className={t.completedAt ? 'task is-done' : 'task'}>
                <div className="task-body">
                  <span className="task-subject">{t.subject}</span>
                  <span className="task-title">{t.title}</span>
                </div>
                {t.completedAt ? (
                  <span className="task-time num">{timeLabel(t.completedAt)}</span>
                ) : (
                  <button type="button" className="task-btn" disabled={pending !== null} onClick={() => p.onComplete(t.id, t.title)}>
                    {pending === t.id ? '記録中…' : '完了する'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {data.allowFreeTasks && (
          <button type="button" className="btn btn-secondary free-open" onClick={p.onOpenFree}>
            やった勉強を記録する
          </button>
        )}
      </section>

      <TabBar />

      {done && (
        <CompletionSheet
          title={done.title}
          completedAt={done.result.completedAt}
          cells={cells}
          currentDays={done.result.currentDays}
          completedToday={done.result.completedToday}
          onClose={p.onCloseDone}
        />
      )}
      {freeOpen && <FreeTaskSheet busy={freeBusy} error={freeError} onSubmit={p.onSubmitFree} onClose={p.onCloseFree} />}
    </div>
  )
}
