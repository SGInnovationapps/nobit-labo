import { useCallback, useEffect, useState } from 'react'
import { CompletionSheet } from './CompletionSheet'
import { FreeTaskSheet } from './FreeTaskSheet'
import { RecordBand } from './RecordBand'
import { TabBar } from './TabBar'
import type { Tab } from './TabBar'
import { FocusDoneSheet } from './FocusDoneSheet'
import { FocusPanel } from './FocusPanel'
import { TimerPanel } from './TimerPanel'
import { TimerSheet } from './TimerSheet'
import {
  cancelStudyTimer, completeTask, FreeTaskError, loadHome, pauseFocusSession, recordStudyTag, registerFreeTask, resumeFocusSession,
  startFocusSession, startStudyTimer, stopStudyTimer,
} from './homeApi'
import type { CompleteResult, HomeData, StudyResult } from './homeApi'
import {
  buildBand, cheerOf, coinNote, dateLabel, focusNote, dayState, jstDate, monthStudyDays, sortTasks, STATE_LABEL, SUBJECTS, timeLabel,
} from './homeModel'

type Props = { clubId: string; clubName: string | null; displayName: string | null; onTab?: (tab: Tab) => void }

const FREE_ERRORS: Record<string, string> = {
  daily_limit_reached: '今日の自由登録は、3件までです。',
  free_tasks_disabled: 'このクラブでは、自由登録を使えません。',
}

/** 01 ホーム・今日のクエスト（Phase 1：連続記録・記録の帯・今日のタスク・自由登録） */
export function Home({ clubId, clubName, displayName, onTab }: Props) {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [done, setDone] = useState<{ title: string; result: CompleteResult } | null>(null)
  const [freeOpen, setFreeOpen] = useState(false)
  const [freeBusy, setFreeBusy] = useState(false)
  const [freeError, setFreeError] = useState<string | null>(null)
  const [tagPending, setTagPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [timerOpen, setTimerOpen] = useState(false)
  const [focusOpen, setFocusOpen] = useState(false)
  const [focusDone, setFocusDone] = useState<{ subject: string; coins: number; currentDays: number } | null>(null)
  const [timerBusy, setTimerBusy] = useState(false)
  const [timerError, setTimerError] = useState<string | null>(null)

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

  const SAVE_FAIL = '保存できませんでした。通信を確認して、もう一度お試しください。'
  const noticeOf = (r: StudyResult) => `記録しました　${coinNote(r.coinsGranted)}`.trim()

  async function onTag(subject: string) {
    setTagPending(subject)
    setNotice(null)
    try {
      const r = await recordStudyTag(subject)
      await load()
      setNotice(`${subject}を${noticeOf(r)}`)
    } catch (e) {
      console.error(e)
      setError(SAVE_FAIL)
    } finally {
      setTagPending(null)
    }
  }

  async function onStartTimer(subject: string, content: string | null) {
    setTimerBusy(true)
    setTimerError(null)
    try {
      if (focusOpen) await startFocusSession(subject, content)
      else await startStudyTimer(subject, content)
      await load()
      setTimerOpen(false)
      setFocusOpen(false)
    } catch (e) {
      console.error(e)
      const m = e instanceof Error ? e.message : ''
      setTimerError(m.includes('timer_already_running') ? 'すでにタイマーが動いています。' : SAVE_FAIL)
    } finally {
      setTimerBusy(false)
    }
  }

  async function onStopTimer(minutes: number | null) {
    setTimerBusy(true)
    setTimerError(null)
    setNotice(null)
    try {
      const subject = data?.timer?.subject ?? ''
      const r = await stopStudyTimer(minutes)
      await load()
      if (r.focusAchieved) setFocusDone({ subject, coins: r.coinsGranted + r.focusBonus, currentDays: r.currentDays })
      setNotice(data?.timer?.focusTargetSeconds != null ? focusNote(r) : noticeOf(r))
    } catch (e) {
      console.error(e)
      setTimerError(SAVE_FAIL)
    } finally {
      setTimerBusy(false)
    }
  }

  async function onPauseResume(pause: boolean) {
    setTimerBusy(true)
    setTimerError(null)
    try {
      if (pause) await pauseFocusSession()
      else await resumeFocusSession()
      await load()
    } catch (e) {
      console.error(e)
      setTimerError(SAVE_FAIL)
    } finally {
      setTimerBusy(false)
    }
  }

  async function onCancelTimer() {
    setTimerBusy(true)
    setTimerError(null)
    try {
      await cancelStudyTimer()
      await load()
    } catch (e) {
      console.error(e)
      setTimerError(SAVE_FAIL)
    } finally {
      setTimerBusy(false)
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
      tagPending={tagPending}
      notice={notice}
      onTab={onTab}
      focusDone={focusDone}
      onCloseFocusDone={() => setFocusDone(null)}
      timerOpen={timerOpen}
      focusOpen={focusOpen}
      timerBusy={timerBusy}
      timerError={timerError}
      onTag={(sub) => void onTag(sub)}
      onOpenTimer={() => { setTimerError(null); setFocusOpen(false); setTimerOpen(true) }}
      onOpenFocus={() => { setTimerError(null); setFocusOpen(true); setTimerOpen(true) }}
      onPauseFocus={() => void onPauseResume(true)}
      onResumeFocus={() => void onPauseResume(false)}
      onCloseTimer={() => { setTimerOpen(false); setFocusOpen(false) }}
      onStartTimer={(sub, c) => void onStartTimer(sub, c)}
      onStopTimer={(m) => void onStopTimer(m)}
      onCancelTimer={() => void onCancelTimer()}
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
  tagPending: string | null
  notice: string | null
  onTab?: (tab: Tab) => void
  focusDone: { subject: string; coins: number; currentDays: number } | null
  onCloseFocusDone: () => void
  timerOpen: boolean
  focusOpen: boolean
  timerBusy: boolean
  timerError: string | null
  onTag: (subject: string) => void
  onOpenTimer: () => void
  onOpenFocus: () => void
  onPauseFocus: () => void
  onResumeFocus: () => void
  onCloseTimer: () => void
  onStartTimer: (subject: string, content: string | null) => void
  onStopTimer: (minutes: number | null) => void
  onCancelTimer: () => void
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
        <p className="streak-sub">
          最長記録 <span className="num">{data.streak.longest}</span> 日　今月の学習 <span className="num">{monthStudyDays(data.activity, data.today)}</span> 日
        </p>
        <p className="streak-sub">コイン <span className="num coin-num">{data.coins}</span></p>
      </section>

      <section className="section" aria-label="記録の帯">
        <RecordBand cells={cells} />
      </section>

      <p className="cheer"><span className="cheer-name">ノビット</span>{cheerOf(tasks)}</p>

      {error && <p className="error" role="alert">{error}</p>}

      {data.support && (
        <section className="section support" aria-labelledby="support-h">
          <h2 id="support-h">クラブからの応援</h2>
          <p className="support-body">{data.support.body}</p>
          <p className="support-date num">{dateLabel(jstDate(data.support.createdAt))}</p>
        </section>
      )}

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
            自分のタスクを追加する
          </button>
        )}
      </section>

      <section className="section" aria-labelledby="tag-h">
        <h2 id="tag-h">教科で記録する</h2>
        <p className="muted tag-help">タスク以外の勉強も、終わったあとにワンタップで。</p>
        <div className="tag-row">
          {SUBJECTS.map((s) => (
            <button key={s} type="button" className="tag-btn" disabled={p.tagPending !== null} onClick={() => p.onTag(s)}>
              {p.tagPending === s ? '…' : s}
            </button>
          ))}
        </div>
        {p.notice && <p className="record-notice" role="status">{p.notice}</p>}
      </section>

      {data.timer && data.timer.focusTargetSeconds != null ? (
        <FocusPanel
          timer={{ ...data.timer, focusTargetSeconds: data.timer.focusTargetSeconds }}
          busy={p.timerBusy}
          error={p.timerError}
          onPause={p.onPauseFocus}
          onResume={p.onResumeFocus}
          onStop={() => p.onStopTimer(null)}
          onCancel={p.onCancelTimer}
        />
      ) : data.timer ? (
        <TimerPanel timer={data.timer} busy={p.timerBusy} error={p.timerError} onStop={p.onStopTimer} onCancel={p.onCancelTimer} />
      ) : (
        <section className="section" aria-label="タイマー">
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={p.onOpenFocus}>15分集中する</button>
            <button type="button" className="btn btn-secondary" onClick={p.onOpenTimer}>タイマーで記録する</button>
          </div>
        </section>
      )}

      <TabBar current="ホーム" onSelect={p.onTab} />

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
      {p.focusDone && (
        <FocusDoneSheet subject={p.focusDone.subject} coins={p.focusDone.coins} currentDays={p.focusDone.currentDays} onClose={p.onCloseFocusDone} />
      )}
      {p.timerOpen && !data.timer && <TimerSheet focus={p.focusOpen} busy={p.timerBusy} error={p.timerError} onStart={p.onStartTimer} onClose={p.onCloseTimer} />}
      {freeOpen && <FreeTaskSheet busy={freeBusy} error={freeError} onSubmit={p.onSubmitFree} onClose={p.onCloseFree} />}
    </div>
  )
}
