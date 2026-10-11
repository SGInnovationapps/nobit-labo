import { useCallback, useEffect, useRef, useState } from 'react'
import { CompletionSheet } from './CompletionSheet'
import { HomeActions } from './HomeActions'
import { IconChevron, IconNext, IconSprout, IconStar, IconTimer } from './HomeIcons'
import { SubjectSheet } from './SubjectSheet'
import { TaskSheet } from './TaskSheet'
import { WeekChart } from './WeekChart'
import { TabBar } from './TabBar'
import type { Tab } from './TabBar'
import { FocusDoneSheet } from './FocusDoneSheet'
import { Nobit } from './Nobit'
import { FocusPanel } from './FocusPanel'
import { QuestPanel } from './QuestPanel'
import { TagPanel } from './TagPanel'
import { TicketPanel } from './TicketPanel'
import { TimerPanel } from './TimerPanel'
import { TimerSheet } from './TimerSheet'
import {
  cancelStudyTimer, completeTask, markResumeSeen, loadHome, pauseFocusSession, recordStudyTag, resumeFocusSession,
  setStudyContent, startFocusSession, startStudyTimer, stopStudyTimer, useRestTicket,
} from './homeApi'
import type { HomeData, StudyResult } from './homeApi'
import type { HomeTask } from './homeModel'
import {
  addDays, BAND_NOTE, buildBand, buildWeek, homeStateOf, isNewSupport, nextMilestone, questsOf, RECORD_PREVIEW, recordsOpenFor, shortFirst, stateCheer, ticketErrorMessage,
  todayRecords, coinNote, dateLabel, focusNote, shouldShowSheet, sheetLabel, sortTasks, timeLabel, visibleRecords,
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

/** 01 ホーム・今日のクエスト（v1.7：状態ごとの面、その下に「教科を記録する」「タスクを見る」、今日の記録、この7日間。残りは下に） */
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
  // 再開の状態：途切れたあとの最初の起動で出し、見たことを記録する。記録するまでは画面を保つ（閉じる操作はない）
  const [resumeActive, setResumeActive] = useState(false)
  const resumeMarked = useRef(false)
  const [timerBusy, setTimerBusy] = useState(false)
  const [timerError, setTimerError] = useState<string | null>(null)
  const [ticketBusy, setTicketBusy] = useState(false)
  const [ticketError, setTicketError] = useState<string | null>(null)

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

  async function onUseTicket(which: 'today' | 'yesterday') {
    if (!data) return
    setTicketBusy(true)
    setTicketError(null)
    try {
      await useRestTicket(which === 'today' ? data.today : addDays(data.today, -1))
      setResumeActive(false)
      await load()
    } catch (e) {
      console.error(e)
      setTicketError(ticketErrorMessage(e))
      await load()
    } finally {
      setTicketBusy(false)
    }
  }

  useEffect(() => {
    if (data?.resume && !resumeMarked.current) {
      resumeMarked.current = true
      setResumeActive(true)
      void markResumeSeen()
    }
    // 記録が付いたら、再開の状態は終わる
    if (data && (data.activity.find((a) => a.date === data.today)?.count ?? 0) > 0) setResumeActive(false)
  }, [data])

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
    <HomeView
      resume={resumeActive}
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
      ticketBusy={ticketBusy}
      ticketError={ticketError}
      onUseTicket={(w) => void onUseTicket(w)}
      onComplete={(id, title) => void onComplete(id, title)}
      onCloseDone={() => setDone(null)}
      onGacha={() => { setDone(null); onGacha?.() }}
      onTag={(sub) => void onTag(sub)}
      onSaveContent={(c) => void onSaveContent(c)}
      onCloseTagPanel={() => setTagPanel(null)}
      onTaskTimer={(t) => void onQuickTimer(t.subject, t.title, t.id)}
      onTagTimer={(sub) => void onQuickTimer(sub, null, null)}
      onStartTimer={(sub, c) => void onQuickTimer(sub, c, null)}
      onOpenFocus={() => { setTimerError(null); setFocusOpen(true) }}
      onPauseFocus={() => void onPauseResume(true)}
      onResumeFocus={() => void onPauseResume(false)}
      onCloseFocus={() => setFocusOpen(false)}
      onStartFocus={(sub, c) => void onStartFocus(sub, c)}
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
  ticketBusy?: boolean
  ticketError?: string | null
  onUseTicket?: (which: 'today' | 'yesterday') => void
  /** 連続記録が途切れたあとの最初の起動（ホームの再開の状態） */
  resume?: boolean
  onComplete: (id: string, title: string) => void
  onCloseDone: () => void
  onGacha: () => void
  onTag: (subject: string) => void
  onSaveContent: (content: string | null) => void
  onCloseTagPanel: () => void
  onTaskTimer: (task: { id: string; subject: string; title: string }) => void
  onTagTimer: (subject: string) => void
  /** 教科のシートの「タイマーで記録する」から、教科と内容を選んで始める */
  onStartTimer?: (subject: string, content: string | null) => void
  onOpenFocus: () => void
  onPauseFocus: () => void
  onResumeFocus: () => void
  onCloseFocus: () => void
  onStartFocus: (subject: string, content: string | null) => void
  onStopTimer: (minutes: number | null) => void
  onCancelTimer: () => void
}

const RECORDS_OPEN_KEY = 'nobit.home.recordsOpen'

function readRecordsOpen(today: string): boolean {
  try {
    return recordsOpenFor(localStorage.getItem(RECORDS_OPEN_KEY), today)
  } catch {
    return false
  }
}

function writeRecordsOpen(today: string, open: boolean) {
  try {
    if (open) localStorage.setItem(RECORDS_OPEN_KEY, today)
    else localStorage.removeItem(RECORDS_OPEN_KEY)
  } catch {
    // 保存できなくても、開閉そのものは画面の中で続ける
  }
}

export function HomeView(p: HomeViewProps) {
  const { data, clubName, displayName, error, pending, done } = p
  const tasks = sortTasks(data.tasks)
  const cells = buildBand(data.activity, data.today, 14, data.restDates)
  const week = buildWeek(data.activity, data.today, data.restDates)
  const timerRunning = data.timer !== null
  const todayCount = data.activity.find((a) => a.date === data.today)?.count ?? 0
  const state = homeStateOf({ todayCount, studyDaysTotal: data.studyDaysTotal, tasks, resume: p.resume ?? false })
  const cheer = stateCheer(state, todayCount)
  const records = todayRecords({ tasks, tags: data.tags, timers: data.timerRecords })
  const milestone = nextMilestone(data.streak.current)
  const newSupport = data.support && isNewSupport(data.support.createdAt, data.today)
  const supportText = data.support ? (data.support.kind === 'seen' ? '見たよ' : data.support.body) : ''
  const supportFrom = data.support ? `${data.support.authorName ?? 'クラブの管理者'}さんから` : ''

  const [pickOpen, setPickOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [timerPick, setTimerPick] = useState(false)
  const [recordsOpen, setRecordsOpen] = useState(() => readRecordsOpen(data.today))
  const shownRecords = visibleRecords(records, recordsOpen)
  const toggleRecords = () => {
    const next = !recordsOpen
    setRecordsOpen(next)
    writeRecordsOpen(data.today, next)
  }

  const cheerLine = cheer && <p className="cheer"><span className="cheer-name">ノビット</span>{cheer}</p>

  const taskRows = (list: ReadonlyArray<HomeTask>) => (
    <ul className="tasks">
      {list.map((t) => (
        <li key={t.id} className={t.completedAt ? 'task is-done' : 'task'}>
          <div className="task-body">
            <span className="task-subject">{t.subject}{t.estimatedMinutes != null && <>　見込み<span className="num">{t.estimatedMinutes}</span>分</>}</span>
            <span className="task-title">{t.title}</span>
          </div>
          {t.completedAt ? (
            <span className="task-time num">{timeLabel(t.completedAt)}</span>
          ) : (
            <div className="task-actions">
              <button type="button" className="task-btn task-btn-sub" disabled={pending !== null || timerRunning || p.timerBusy} onClick={() => p.onTaskTimer({ id: t.id, subject: t.subject, title: t.title })}>
                タイマー
              </button>
              <button type="button" className="task-btn" disabled={pending !== null} onClick={() => p.onComplete(t.id, t.title)}>
                {pending === t.id ? '記録中…' : '完了'}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )

  const todayTasks = (title: string, list: ReadonlyArray<HomeTask>, emptyText: string, side?: string) => (
    <section className="section" aria-labelledby="today-h">
      <div className="today-head">
        <h2 id="today-h">{title}</h2>
        <span className="rec-count">{side ?? <><span className="num">{list.length}</span> 件</>}</span>
      </div>
      {list.length === 0 ? <p className="muted">{emptyText}</p> : taskRows(list)}
    </section>
  )

  const recordList = (
    <section className="section" aria-labelledby="rec-h">
      <div className="today-head">
        <h2 id="rec-h">今日の記録</h2>
        <span className="rec-count"><span className="num">{records.length}</span> 件</span>
      </div>
      <ul className="rec-list" id="rec-list">
        {shownRecords.shown.map((r) => (
          <li key={r.key} className="rec-row">
            <span className="rec-time num">{timeLabel(r.at)}</span>
            <span className="rec-name">{r.name}{r.minutes !== null && <span className="rec-min"> <span className="num">{r.minutes}</span>分</span>}</span>
            <span className="rec-kind">{r.kind}</span>
          </li>
        ))}
      </ul>
      {records.length > RECORD_PREVIEW && (
        <button type="button" className="rec-toggle" aria-expanded={recordsOpen} aria-controls="rec-list" onClick={toggleRecords}>
          {recordsOpen ? 'たたむ' : `ほか${shownRecords.hidden}件を表示`}
          <span className={recordsOpen ? 'rec-chevron is-open' : 'rec-chevron'}><IconChevron /></span>
        </button>
      )}
    </section>
  )

  const gachaLine = todayCount > 0 && !data.gachaDrawnToday && p.onGacha && (
    <button type="button" className={state === 'done' ? 'gacha-row is-filled' : 'gacha-row'} onClick={p.onGacha}>
      <span>{state === 'done' ? '今日のガチャを引く' : '今日のガチャを引ける'}</span>
      <small>無料 1回</small>
      <IconNext />
    </button>
  )

  return (
    <div className="home">
      <header className="home-head">
        <p className="muted home-sub">{dateLabel(data.today)}　{clubName ?? ''}{displayName ? `　${displayName}` : ''}</p>
      </header>

      {state === 'resume' ? (
        <section className="face face-art" aria-label="おかえり">
          <div className="face-text">
            <h1 className="face-title">おかえり。</h1>
            <p className="face-lead">また、ここから<br />始めよう。</p>
            <p className="face-note">これまでのがんばりは、<br />ちゃんと残ってる。</p>
          </div>
          <Nobit mood="wave" className="face-nobit" />
        </section>
      ) : state === 'done' ? (
        <section className="face face-art" aria-label="今日のタスク">
          <div className="face-text">
            <p className="face-label">すべて完了</p>
            <h1 className="face-title is-small">今日のタスクは<br />完了！</h1>
            {cheerLine}
            <p className="face-streak">連続 <span className="num">{data.streak.current}</span><span className="face-streak-unit">日</span></p>
          </div>
          <Nobit mood="joy" className="face-nobit" />
        </section>
      ) : (
        <section className="face" aria-label={state === 'first' ? 'はじめての記録' : '連続記録'}>
          <div className="face-top">
            <p className="face-label">{state === 'first' ? 'はじめての記録' : '連続日数'}</p>
            <span className="face-mark"><IconSprout /></span>
          </div>
          {state === 'first' ? (
            <h1 className="face-first">今日を <span className="num">1</span>日目に<br />しよう。</h1>
          ) : (
            <p className="streak-main"><span className="num streak-num">{data.streak.current}</span><span className="streak-unit">日</span></p>
          )}
          {cheerLine}
          {state !== 'first' && milestone && (
            <div className="face-next">
              <span>連続{milestone.target}日まで あと<span className="num">{milestone.remaining}</span>日</span>
              <div className="next-bar" role="progressbar" aria-valuemin={0} aria-valuemax={milestone.target} aria-valuenow={data.streak.current} aria-label="次の節目までの進み">
                <i style={{ width: `${Math.round(milestone.ratio * 100)}%` }} />
              </div>
            </div>
          )}
        </section>
      )}

      {newSupport && state !== 'resume' && (
        <p className="support-line"><span className="support-from">{supportFrom}</span>{supportText}</p>
      )}

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

      {state === 'resume' && (
        <>
          <dl className="resume-stats">
            <div>
              <dt>最長記録</dt>
              <dd><span className="num">{data.streak.longest}</span><span className="resume-unit">日</span></dd>
            </div>
            <div>
              <dt>これまでの学習</dt>
              <dd><span className="num">{data.studyDaysTotal}</span><span className="resume-unit">日</span></dd>
            </div>
          </dl>
          {data.tickets && data.tickets.balance > 0 && data.tickets.canProtectYesterday && (
            <TicketPanel info={data.tickets} busy={p.ticketBusy ?? false} error={p.ticketError ?? null} onUse={(w) => p.onUseTicket?.(w)} />
          )}
        </>
      )}

      <HomeActions
        tasks={tasks}
        quiet={state === 'done'}
        disabled={p.tagPending !== null}
        onSubjects={() => setPickOpen(true)}
        onTasks={() => setTasksOpen(true)}
      />

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

      {(state === 'first' || state === 'notyet') && todayTasks('今日やること', tasks, '配信されたタスクは、まだありません。教科の記録からも始められます。')}
      {state === 'resume' && todayTasks('まずは短いものから', shortFirst(tasks, 1), '今日のタスクはまだありません。教科の記録やタイマーからも始められます。', '見込み時間の短い順')}

      {(state === 'recording' || state === 'done') && recordList}
      {gachaLine}

      <WeekChart
        cells={week}
        note={state === 'first' ? '記録すると、ここに毎日の棒が伸びていく。' : state === 'resume' ? BAND_NOTE : undefined}
      />

      <section className="section below" aria-label="続けるために">
        {(state === 'first' || state === 'done' || state === 'resume') && milestone && (
          <div className="next-goal">
            <span className="next-goal-mark"><IconStar /></span>
            <div className="next-goal-main">
              <p className="next-title-text">連続{milestone.target}日</p>
              <div className="next-bar" role="progressbar" aria-valuemin={0} aria-valuemax={milestone.target} aria-valuenow={data.streak.current} aria-label="次の節目までの進み">
                <i style={{ width: `${Math.round(milestone.ratio * 100)}%` }} />
              </div>
            </div>
            <span className="next-goal-left">あと<span className="num">{milestone.remaining}</span>日</span>
          </div>
        )}
        <QuestPanel quests={questsOf({ tasks, tags: data.tags, timerSeconds: data.timerSeconds, timerSubjects: data.timerSubjects })} />
      </section>

      <p className="coin-line"><span className="coin-dot" aria-hidden="true" />コイン <span className="num coin-num">{data.coins}</span></p>

      {data.tickets && state !== 'resume' && (
        <TicketPanel info={data.tickets} busy={p.ticketBusy ?? false} error={p.ticketError ?? null} onUse={(w) => p.onUseTicket?.(w)} />
      )}

      {!timerRunning && (
        <button type="button" className="focus-entry" onClick={p.onOpenFocus}>
          <IconTimer />
          <span className="focus-entry-label">15分集中モード</span>
          <span className="focus-entry-note">達成で5コイン</span>
        </button>
      )}

      {data.support && (
        <section className="section" aria-label="クラブ管理者の応援">
          <p className="support-line"><span className="support-from">{supportFrom}</span>{supportText}</p>
        </section>
      )}

      <TabBar current="ホーム" onSelect={p.onTab} />

      {pickOpen && (
        <SubjectSheet
          tags={data.tags}
          pending={p.tagPending}
          timerDisabled={timerRunning || p.timerBusy || !p.onStartTimer}
          onPick={(s) => { setPickOpen(false); p.onTag(s) }}
          onTimer={() => { setPickOpen(false); setTimerPick(true) }}
          onClose={() => setPickOpen(false)}
        />
      )}
      {tasksOpen && (
        <TaskSheet count={tasks.length} onClose={() => setTasksOpen(false)}>
          {tasks.length === 0 ? <p className="muted">配信されたタスクは、まだありません。</p> : taskRows(tasks)}
        </TaskSheet>
      )}
      {timerPick && !data.timer && p.onStartTimer && (
        <TimerSheet busy={p.timerBusy} error={p.timerError} onStart={(s, c) => { setTimerPick(false); p.onStartTimer?.(s, c) }} onClose={() => setTimerPick(false)} />
      )}

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
