import { useCallback, useEffect, useState } from 'react'
import { CompletionSheet } from './CompletionSheet'
import { RecordBand } from './RecordBand'
import { TabBar } from './TabBar'
import type { Tab } from './TabBar'
import { FocusDoneSheet } from './FocusDoneSheet'
import { ResumeView } from './Resume'
import { FocusPanel } from './FocusPanel'
import { TagPanel } from './TagPanel'
import { TimerPanel } from './TimerPanel'
import { TimerSheet } from './TimerSheet'
import {
  cancelStudyTimer, completeTask, markResumeSeen, loadHome, pauseFocusSession, recordStudyTag, resumeFocusSession,
  setStudyContent, startFocusSession, startStudyTimer, stopStudyTimer,
} from './homeApi'
import type { HomeData, StudyResult } from './homeApi'
import {
  buildBand, cheerOf, shortFirst, coinNote, dateLabel, focusNote, dayState, recordedTime, shouldShowSheet, sheetLabel, sortTasks,
  STATE_LABEL, SUBJECTS, timeLabel,
} from './homeModel'

type Props = { clubId: string; clubName: string | null; displayName: string | null; onTab?: (tab: Tab) => void; onGacha?: () => void }

/** 全面のシート（02）に出す内容。入口（タスク・教科・タイマー）を問わず同じ */
export type SheetInfo = {
  label: string
  title: string
  completedAt: string
  currentDays: number
  completedToday: number
  firstOfDay: boolean
}

/** 教科ボタンを押したあとの任意の操作（内容を足す・この教科でタイマー） */
export type TagPanelState = { subject: string; recordId: string; recordedAt: string; hasContent: boolean }

const SAVE_FAIL = '保存できませんでした。通信を確認して、もう一度お試しください。'

/** 01 ホーム・今日のクエスト（v1.7：連続日数・今日のタスク・教科ボタンを最初の画面に置き、残りは下に） */
export function Home({ clubId, clubName, displayName, onTab, onGacha }: Props) {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [done, setDone] = useState<SheetInfo | null>(null)
  const [tagPanel, setTagPanel] = useState<TagPanelState | null>(null)
  const [panelBusy, setPanelBusy] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [tagPending, setTagPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [focusOpen, setFocusOpen] = useState(false)
  const [focusDone, setFocusDone] = useState<{ subject: string; coins: number; currentDays: number } | null>(null)
  const [resumeSeen, setResumeSeen] = useState(false)
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

  const noticeOf = (r: StudyResult) => `記録しました　${coinNote(r.coinsGranted)}`.trim()

  async function onComplete(id: string, title: string) {
    setPending(id)
    setNotice(null)
    try {
      const r = await completeTask(id)
      await load()
      if (!r.alreadyCompleted && shouldShowSheet(r)) {
        setDone({ label: sheetLabel(r), title, completedAt: r.completedAt, currentDays: r.currentDays, completedToday: r.completedToday, firstOfDay: r.firstOfDay })
      }
    } catch (e) {
      console.error(e)
      setError('記録できませんでした。通信を確認して、もう一度お試しください。')
    } finally {
      setPending(null)
    }
  }

  async function onTag(subject: string) {
    setNotice(null)
    setPanelError(null)
    // すでに記録した教科は、新しく記録せず、操作の欄だけ開く（同じ教科は1日1回）
    const existing = data?.tags.find((t) => t.subject === subject)
    if (existing) {
      setTagPanel({ subject, recordId: existing.id, recordedAt: existing.recordedAt, hasContent: false })
      return
    }
    setTagPending(subject)
    try {
      const r = await recordStudyTag(subject)
      await load()
      if (r.recordId && r.recordedAt) setTagPanel({ subject, recordId: r.recordId, recordedAt: r.recordedAt, hasContent: false })
      if (shouldShowSheet(r) && r.recordedAt) {
        setDone({ label: sheetLabel(r), title: `${subject}を記録`, completedAt: r.recordedAt, currentDays: r.currentDays, completedToday: r.completedToday, firstOfDay: r.firstOfDay })
      }
    } catch (e) {
      console.error(e)
      setError(SAVE_FAIL)
    } finally {
      setTagPending(null)
    }
  }

  async function onSaveContent(content: string | null) {
    if (!tagPanel) return
    setPanelBusy(true)
    setPanelError(null)
    try {
      await setStudyContent(tagPanel.recordId, content)
      setTagPanel({ ...tagPanel, hasContent: content !== null })
      setNotice(content ? '内容を保存しました' : '内容を消しました')
    } catch (e) {
      console.error(e)
      setPanelError(SAVE_FAIL)
    } finally {
      setPanelBusy(false)
    }
  }

  /** タスクの行の「タイマー」と、教科の「この教科でタイマー」。どちらも、すぐ始める */
  async function onQuickTimer(subject: string, content: string | null, userTaskId: string | null) {
    setTimerBusy(true)
    setTimerError(null)
    setNotice(null)
    try {
      await startStudyTimer(subject, content, userTaskId)
      setTagPanel(null)
      await load()
    } catch (e) {
      console.error(e)
      const m = e instanceof Error ? e.message : ''
      setTimerError(m.includes('timer_already_running') ? 'すでにタイマーが動いています。' : SAVE_FAIL)
    } finally {
      setTimerBusy(false)
    }
  }

  /** 15分集中モードを始める（教科と内容を選ぶ） */
  async function onStartFocus(subject: string, content: string | null) {
    setTimerBusy(true)
    setTimerError(null)
    try {
      await startFocusSession(subject, content)
      await load()
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
      const wasFocus = data?.timer?.focusTargetSeconds != null
      const r = await stopStudyTimer(minutes)
      await load()
      if (r.focusAchieved) setFocusDone({ subject, coins: r.coinsGranted + r.focusBonus, currentDays: r.currentDays })
      else if (shouldShowSheet(r)) {
        setDone({ label: sheetLabel(r), title: `${subject}のタイマー`, completedAt: new Date().toISOString(), currentDays: r.currentDays, completedToday: r.completedToday, firstOfDay: r.firstOfDay })
      }
      setNotice(wasFocus ? focusNote(r) : noticeOf(r))
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
    data.resume && !resumeSeen ? (
      <ResumeView
        cells={buildBand(data.activity, data.today, 30, data.restDates)}
        longestDays={data.resume.longestDays}
        badgeCount={data.resume.badgeCount}
        tasks={shortFirst(data.tasks)}
        onStart={() => { setResumeSeen(true); void markResumeSeen() }}
      />
    ) : (
    <HomeView
      data={data}
      clubName={clubName}
      displayName={displayName}
      error={error}
      pending={pending}
      done={done}
      tagPending={tagPending}
      tagPanel={tagPanel}
      panelBusy={panelBusy}
      panelError={panelError}
      notice={notice}
      onTab={onTab}
      focusDone={focusDone}
      onCloseFocusDone={() => setFocusDone(null)}
      focusOpen={focusOpen}
      timerBusy={timerBusy}
      timerError={timerError}
      onComplete={(id, title) => void onComplete(id, title)}
      onCloseDone={() => setDone(null)}
      onGacha={() => { setDone(null); onGacha?.() }}
      onTag={(sub) => void onTag(sub)}
      onSaveContent={(c) => void onSaveContent(c)}
      onCloseTagPanel={() => setTagPanel(null)}
      onTaskTimer={(t) => void onQuickTimer(t.subject, t.title, t.id)}
      onTagTimer={(sub) => void onQuickTimer(sub, null, null)}
      onOpenFocus={() => { setTimerError(null); setFocusOpen(true) }}
      onPauseFocus={() => void onPauseResume(true)}
      onResumeFocus={() => void onPauseResume(false)}
      onCloseFocus={() => setFocusOpen(false)}
      onStartFocus={(sub, c) => void onStartFocus(sub, c)}
      onStopTimer={(m) => void onStopTimer(m)}
      onCancelTimer={() => void onCancelTimer()}
    />
    )
  )
}

export type HomeViewProps = {
  data: HomeData
  clubName: string | null
  displayName: string | null
  error: string | null
  pending: string | null
  done: SheetInfo | null
  tagPending: string | null
  tagPanel: TagPanelState | null
  panelBusy: boolean
  panelError: string | null
  notice: string | null
  onTab?: (tab: Tab) => void
  focusDone: { subject: string; coins: number; currentDays: number } | null
  onCloseFocusDone: () => void
  focusOpen: boolean
  timerBusy: boolean
  timerError: string | null
  onComplete: (id: string, title: string) => void
  onCloseDone: () => void
  onGacha: () => void
  onTag: (subject: string) => void
  onSaveContent: (content: string | null) => void
  onCloseTagPanel: () => void
  onTaskTimer: (task: { id: string; subject: string; title: string }) => void
  onTagTimer: (subject: string) => void
  onOpenFocus: () => void
  onPauseFocus: () => void
  onResumeFocus: () => void
  onCloseFocus: () => void
  onStartFocus: (subject: string, content: string | null) => void
  onStopTimer: (minutes: number | null) => void
  onCancelTimer: () => void
}

export function HomeView(p: HomeViewProps) {
  const { data, clubName, displayName, error, pending, done } = p
  const tasks = sortTasks(data.tasks)
  const state = dayState(tasks)
  const cells = buildBand(data.activity, data.today, 30, data.restDates)
  const noTasks = tasks.length === 0
  const timerRunning = data.timer !== null

  const subjects = (
    <section className={noTasks ? 'section subjects is-primary' : 'section subjects'} aria-labelledby="tag-h">
      <h2 id="tag-h">{noTasks ? '今日の勉強を記録する' : '教科で記録する'}</h2>
      <div className="tag-row">
        {SUBJECTS.map((s) => {
          const time = recordedTime(data.tags, s)
          return (
            <button key={s} type="button" className={time ? 'tag-btn is-recorded' : 'tag-btn'} disabled={p.tagPending !== null} onClick={() => p.onTag(s)}>
              <span className="tag-btn-name">{p.tagPending === s ? '…' : s}</span>
              {time && <span className="tag-btn-time num">{time}</span>}
            </button>
          )
        })}
      </div>
      {p.tagPanel && (
        <TagPanel
          subject={p.tagPanel.subject}
          recordedAt={p.tagPanel.recordedAt}
          hasContent={p.tagPanel.hasContent}
          busy={p.panelBusy || p.timerBusy || timerRunning}
          error={p.panelError}
          onSaveContent={p.onSaveContent}
          onTimer={() => p.onTagTimer(p.tagPanel!.subject)}
          onClose={p.onCloseTagPanel}
        />
      )}
      {p.notice && <p className="record-notice" role="status">{p.notice}</p>}
    </section>
  )

  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">NOBIT!</div>
        <p className="muted home-sub">{dateLabel(data.today)}　{clubName ?? ''}{displayName ? `　${displayName}` : ''}</p>
      </header>

      <section className="streak" aria-label="連続記録">
        <p className="streak-main"><span className="num streak-num">{data.streak.current}</span><span className="streak-unit">日連続</span></p>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

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
        p.timerError && <p className="error" role="alert">{p.timerError}</p>
      )}

      {noTasks && subjects}

      <section className="section" aria-labelledby="today-h">
        <div className="today-head">
          <h2 id="today-h">今日のタスク</h2>
          <span className={`state state-${state}`}>{STATE_LABEL[state]}</span>
        </div>
        {noTasks ? (
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
                  <div className="task-actions">
                    <button type="button" className="task-btn" disabled={pending !== null} onClick={() => p.onComplete(t.id, t.title)}>
                      {pending === t.id ? '記録中…' : '完了'}
                    </button>
                    <button type="button" className="task-btn task-btn-sub" disabled={pending !== null || timerRunning || p.timerBusy} onClick={() => p.onTaskTimer({ id: t.id, subject: t.subject, title: t.title })}>
                      タイマー
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!noTasks && subjects}

      <section className="section" aria-label="記録の帯">
        <RecordBand cells={cells} />
      </section>

      <p className="cheer"><span className="cheer-name">ノビット</span>{cheerOf(tasks)}</p>

      {data.support && (
        <p className="support-line">
          <span className="support-from">クラブから</span>{data.support.body}
        </p>
      )}

      <p className="coin-line">コイン <span className="num coin-num">{data.coins}</span></p>

      {!timerRunning && (
        <section className="section" aria-label="15分集中">
          <button type="button" className="btn btn-secondary" onClick={p.onOpenFocus}>15分集中する</button>
        </section>
      )}

      <TabBar current="ホーム" onSelect={p.onTab} />

      {done && (
        <CompletionSheet
          label={done.label}
          title={done.title}
          completedAt={done.completedAt}
          cells={cells}
          currentDays={done.currentDays}
          completedToday={done.completedToday}
          onGacha={done.firstOfDay ? p.onGacha : undefined}
          onClose={p.onCloseDone}
        />
      )}
      {p.focusDone && (
        <FocusDoneSheet subject={p.focusDone.subject} coins={p.focusDone.coins} currentDays={p.focusDone.currentDays} onClose={p.onCloseFocusDone} />
      )}
      {p.focusOpen && !data.timer && <TimerSheet focus busy={p.timerBusy} error={p.timerError} onStart={p.onStartFocus} onClose={p.onCloseFocus} />}
    </div>
  )
}
