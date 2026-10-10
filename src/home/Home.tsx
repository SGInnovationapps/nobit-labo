import { useCallback, useEffect, useRef, useState } from 'react'
import { CompletionSheet } from './CompletionSheet'
import { RecordBand } from './RecordBand'
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
  addDays, BAND_NOTE, buildBand, homeStateOf, isNewSupport, nextMilestone, questsOf, shortFirst, stateCheer, ticketErrorMessage, todayRecords, coinNote, dateLabel, focusNote, recordedTime, shouldShowSheet, sheetLabel, sortTasks,
  SUBJECTS, timeLabel,
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
  const cells = buildBand(data.activity, data.today, 14, data.restDates)
  const timerRunning = data.timer !== null
  const todayCount = data.activity.find((a) => a.date === data.today)?.count ?? 0
  const state = homeStateOf({ todayCount, studyDaysTotal: data.studyDaysTotal, tasks, resume: p.resume ?? false })
  const cheer = stateCheer(state, todayCount)
  const records = todayRecords({ tasks, tags: data.tags, timers: data.timerRecords })
  const remaining = tasks.filter((t) => !t.completedAt)
  const milestone = nextMilestone(data.streak.current)
  const newSupport = data.support && isNewSupport(data.support.createdAt, data.today)
  const [showSubjects, setShowSubjects] = useState(false)
  const supportText = data.support ? (data.support.kind === 'seen' ? '見たよ' : data.support.body) : ''
  const supportFrom = data.support ? `${data.support.authorName ?? 'クラブの管理者'}さんから` : ''

  const subjects = (
    <section className={state === 'first' ? 'section subjects is-primary' : 'section subjects'} aria-labelledby="tag-h">
      <h2 id="tag-h">{state === 'first' ? '今日の勉強を記録する' : '教科で記録する'}</h2>
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

  const taskRows = (list: ReadonlyArray<HomeTask>) => (
    <ul className="tasks">
      {list.map((t) => (
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
  )

  const todayTasks = (title: string, list: ReadonlyArray<HomeTask>, emptyText: string) => (
    <section className="section" aria-labelledby="today-h">
      <div className="today-head">
        <h2 id="today-h">{title}</h2>
      </div>
      {list.length === 0 ? <p className="muted">{emptyText}</p> : taskRows(list)}
    </section>
  )

  const recordList = (
    <section className="section" aria-labelledby="rec-h">
      <div className="today-head">
        <h2 id="rec-h">今日の記録</h2>
        <span className="rec-count"><span className="num">{todayCount}</span> 件</span>
      </div>
      <ul className="rec-list">
        {records.map((r) => (
          <li key={r.key} className="rec-row">
            <span className="rec-time num">{timeLabel(r.at)}</span>
            <span className="rec-name">{r.name}{r.minutes !== null && <span className="rec-min"> <span className="num">{r.minutes}</span>分</span>}</span>
            <span className="rec-kind">{r.kind}</span>
          </li>
        ))}
      </ul>
    </section>
  )

  const gachaLine = todayCount > 0 && !data.gachaDrawnToday && p.onGacha && (
    <p className="gacha-line">
      <span>今日のガチャを引けます</span>
      <button type="button" className="btn-link" onClick={p.onGacha}>引く</button>
    </p>
  )

  return (
    <div className="home">
      <header className="home-head">
        <p className="muted home-sub">{dateLabel(data.today)}　{clubName ?? ''}{displayName ? `　${displayName}` : ''}</p>
      </header>

      {state === 'resume' ? (
        <section className="resume-head" aria-label="おかえり">
          <Nobit mood="wave" className="resume-nobit" />
          <h1 className="resume-title">おかえり。また今日から。</h1>
        </section>
      ) : state === 'first' ? (
        <section className="streak" aria-label="1日目">
          <p className="streak-main"><span className="streak-first">今日が1日目</span></p>
        </section>
      ) : (
        <section className="streak" aria-label="連続記録">
          <p className="streak-main"><span className="num streak-num">{data.streak.current}</span><span className="streak-unit">日連続</span></p>
          {state === 'notyet' && milestone && <p className="streak-sub">あと<span className="num">{milestone.remaining}</span>日で連続{milestone.target}日</p>}
        </section>
      )}

      {cheer && <p className="cheer"><span className="cheer-name">ノビット</span>{cheer}</p>}
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
              <dt>これまでの学習日数</dt>
              <dd><span className="num">{data.studyDaysTotal}</span><span className="resume-unit">日</span></dd>
            </div>
          </dl>
          {data.tickets && data.tickets.balance > 0 && data.tickets.canProtectYesterday && (
            <TicketPanel info={data.tickets} busy={p.ticketBusy ?? false} error={p.ticketError ?? null} onUse={(w) => p.onUseTicket?.(w)} />
          )}
          {subjects}
          {todayTasks('今日、短く始められるタスク', shortFirst(tasks), '今日のタスクはまだありません。教科の記録やタイマーからも始められます。')}
        </>
      )}

      {state === 'first' && (
        <>
          {subjects}
          {todayTasks('今日のタスク', tasks, '配信されたタスクは、まだありません。')}
        </>
      )}

      {state === 'notyet' && (
        <>
          {subjects}
          {todayTasks('今日のタスク', tasks, '配信されたタスクは、まだありません。')}
        </>
      )}

      {state === 'recording' && (
        <>
          {recordList}
          {gachaLine}
          {remaining.length > 0 && todayTasks('残りのタスク', remaining, '')}
          {subjects}
        </>
      )}

      {state === 'done' && (
        <>
          <p className="done-line">今日のタスクは完了</p>
          {recordList}
          {gachaLine}
          <p className="quiet-entry">
            <button type="button" className="btn-link" onClick={() => setShowSubjects((v) => !v)}>教科を記録する</button>
            {!timerRunning && <button type="button" className="btn-link" onClick={p.onOpenFocus}>15分集中</button>}
          </p>
          {(showSubjects || p.tagPanel) && subjects}
        </>
      )}

      <section className="section below" aria-label="続けるために">
        {milestone && (
          <div className="next-title">
            <p className="next-title-text">連続{milestone.target}日まで　あと<span className="num">{milestone.remaining}</span>日</p>
            <div className="next-bar" role="progressbar" aria-valuemin={0} aria-valuemax={milestone.target} aria-valuenow={data.streak.current} aria-label="次の節目までの進み">
              <i style={{ width: `${Math.round(milestone.ratio * 100)}%` }} />
            </div>
          </div>
        )}
        <RecordBand cells={cells} weekdays />
        <p className="band-note">{BAND_NOTE}</p>
      </section>

      <QuestPanel quests={questsOf({ tasks, tags: data.tags, timerSeconds: data.timerSeconds, timerSubjects: data.timerSubjects })} />

      <p className="coin-line">コイン <span className="num coin-num">{data.coins}</span></p>

      {data.tickets && state !== 'resume' && (
        <TicketPanel info={data.tickets} busy={p.ticketBusy ?? false} error={p.ticketError ?? null} onUse={(w) => p.onUseTicket?.(w)} />
      )}

      {!timerRunning && state !== 'done' && (
        <section className="section" aria-label="15分集中">
          <button type="button" className="btn btn-secondary" onClick={p.onOpenFocus}>15分集中する</button>
        </section>
      )}

      {data.support && (
        <section className="section" aria-label="クラブ管理者の応援">
          <p className="support-line"><span className="support-from">{supportFrom}</span>{supportText}</p>
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
