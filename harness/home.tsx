import { ResumeView } from '../src/home/Resume'
import { buildBand, shortFirst } from '../src/home/homeModel'
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { HomeView } from '../src/home/Home'
import type { HomeData } from '../src/home/homeApi'

const today = '2026-10-09'
const act = [1,2,3,5,6,7,8,12,13,14,15,16,17,20,21,22,24,25,26,27,28].map((n, i) => ({ date: `2026-09-${String(n+1).padStart(2,'0')}`, count: (i % 4) + 1 }))
const mk = (tasks: HomeData['tasks'], extra: Partial<HomeData> = {}): HomeData => ({
  today, tasks, streak: { current: 12, longest: 21 }, activity: [...act, { date: '2026-10-07', count: 2 }, { date: '2026-10-08', count: 3 }, { date: '2026-10-09', count: tasks.filter(t => t.completedAt).length }], restDates: ['2026-10-05', '2026-10-06'], allowFreeTasks: false, tags: [], support: null, coins: 240, timer: null, timerSeconds: 600, timerSubjects: ['数学'], tickets: { balance: 1, nextGrantOn: '2026-10-12', canProtectToday: false, canProtectYesterday: false }, ...extra,
})
const T = (id: string, subject: string, title: string, completedAt: string | null, isFree = false) => ({ id, subject, title, estimatedMinutes: null, isFree, completedAt })
const base = {
  clubName: '［クラブ名］', displayName: '表示名', error: null, pending: null, done: null, tagPending: null, tagPanel: null, panelBusy: false, panelError: null, notice: null,
  focusOpen: false, focusDone: null, timerBusy: false, timerError: null,
  onCloseFocusDone() {}, onComplete() {}, onCloseDone() {}, onGacha() {}, onTag() {}, onSaveContent() {}, onCloseTagPanel() {}, onTaskTimer() {}, onTagTimer() {},
  onOpenFocus() {}, onPauseFocus() {}, onResumeFocus() {}, onCloseFocus() {}, onStartFocus() {}, onStopTimer() {}, onCancelTimer() {},
}
const partial = mk([T('a','英語','英単語 Unit 3 の確認テスト', null), T('b','数学','方程式の文章題 5問', '2026-10-09T08:05:00Z'), T('c','国語','漢字ドリル p.12', null, true)])
const none = mk([T('a','英語','英単語 Unit 3 の確認テスト', null), T('b','数学','方程式の文章題 5問', null)], { streak: { current: 0, longest: 21 }, activity: [] })
const all = mk([T('b','数学','方程式の文章題 5問', '2026-10-09T08:05:00Z'), T('a','英語','英単語 Unit 3 の確認テスト', '2026-10-09T09:40:00Z')])
const empty = mk([])
const first = { label: '今日の最初の記録', title: '方程式の文章題 5問', completedAt: '2026-10-09T08:05:00Z', currentDays: 12, completedToday: 1, firstOfDay: true }
const tagged = [{ id: 'g1', subject: '数学', recordedAt: '2026-10-09T08:05:00Z' }]
const screens: Record<string, React.ReactNode> = {
  ticket_use: <HomeView {...base} data={{ ...partial, tickets: { balance: 2, nextGrantOn: '2026-10-12', canProtectToday: true, canProtectYesterday: true } }} />,
  ticket_zero: <HomeView {...base} data={{ ...partial, tickets: { balance: 0, nextGrantOn: '2026-10-12', canProtectToday: false, canProtectYesterday: false } }} />,
  quest_done: <HomeView {...base} data={{ ...all, timerSeconds: 1000, timerSubjects: ['理科'] }} />,
  partial: <HomeView {...base} data={partial} />,
  none: <HomeView {...base} data={none} />,
  support: <HomeView {...base} data={{ ...partial, support: { body: '今週も続けているね。数学の文章題、がんばっていました。', createdAt: '2026-10-08T09:00:00Z', kind: 'comment' as const, authorName: '［管理者名］' } }} />,
  all: <HomeView {...base} data={all} />,
  empty: <HomeView {...base} data={empty} />,
  sheet: <HomeView {...base} data={partial} done={first} />,
  sheet_milestone: <HomeView {...base} data={partial} done={{ ...first, label: '連続記録 7日', firstOfDay: false, completedToday: 3 }} />,
  tagged: <HomeView {...base} data={{ ...none, tags: tagged }} tagPanel={{ subject: '数学', recordId: 'g1', recordedAt: '2026-10-09T08:05:00Z', hasContent: false }} notice="内容を保存しました" />,
  empty_tagged: <HomeView {...base} data={{ ...empty, tags: tagged }} />,
  timerRunning: <HomeView {...base} data={{ ...partial, timer: { id: 't', subject: '英語', content: '英語 配信', startedAt: new Date(Date.now() - 754000).toISOString(), focusTargetSeconds: null, pausedAt: null, pausedSeconds: 0 } }} />,
  focusSheet: <HomeView {...base} data={partial} focusOpen />,
  focusRunning: <HomeView {...base} data={{ ...partial, timer: { id: 'f', subject: '数学', content: '二次関数', startedAt: new Date(Date.now() - 6 * 60000 - 20000).toISOString(), focusTargetSeconds: 900, pausedAt: null, pausedSeconds: 0 } }} />,
  focusDone: <HomeView {...base} data={partial} focusDone={{ subject: '数学', coins: 6, currentDays: 12 }} />,
  focusPaused: <HomeView {...base} data={{ ...partial, timer: { id: 'f', subject: '数学', content: null, startedAt: new Date(Date.now() - 9 * 60000).toISOString(), focusTargetSeconds: 900, pausedAt: new Date(Date.now() - 60000).toISOString(), pausedSeconds: 60 } }} />,
  resume: <ResumeView cells={buildBand(act, '2026-10-09', 30, [])} longestDays={21} badgeCount={4} tasks={shortFirst([T('a','英語','英単語 Unit 3 の確認テスト', null), T('d','理科','電流と電圧 ワーク p.8', null), T('b','数学','方程式の文章題 5問', null)].map((t, i) => ({ ...t, estimatedMinutes: [15, 10, null][i] })))} onStart={() => undefined} />,
  resume_empty: <ResumeView cells={buildBand([], '2026-10-09', 30, [])} longestDays={3} badgeCount={0} tasks={[]} onStart={() => undefined} />,
}
createRoot(document.getElementById('root')!).render(<div className="shell">{screens[location.hash.slice(1)]}</div>)
