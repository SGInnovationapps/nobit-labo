import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { HomeView } from '../src/home/Home'
import type { HomeData } from '../src/home/homeApi'

const today = '2026-10-09'
const act = [1,2,3,5,6,7,8,12,13,14,15,16,17,20,21,22,24,25,26,27,28].map((n, i) => ({ date: `2026-09-${String(n+1).padStart(2,'0')}`, count: (i % 4) + 1 }))
const mk = (tasks: HomeData['tasks'], extra: Partial<HomeData> = {}): HomeData => ({
  today, tasks, streak: { current: 12, longest: 21 }, activity: [...act, { date: '2026-10-07', count: 2 }, { date: '2026-10-08', count: 3 }, { date: '2026-10-09', count: tasks.filter(t => t.completedAt).length }], restDates: ['2026-10-05', '2026-10-06'], allowFreeTasks: true, support: null, coins: 240, timer: null, ...extra,
})
const T = (id: string, subject: string, title: string, completedAt: string | null, isFree = false) => ({ id, subject, title, estimatedMinutes: null, isFree, completedAt })
const base = {
  clubName: '［クラブ名］', displayName: '表示名', error: null, pending: null, done: null, freeOpen: false, freeBusy: false, freeError: null,
  onComplete: () => undefined, onCloseDone: () => undefined, onOpenFree: () => undefined, onCloseFree: () => undefined, onSubmitFree: () => undefined,
  tagPending: null, notice: null, timerOpen: false, focusOpen: false, focusDone: null, onCloseFocusDone() {}, onOpenFocus() {}, onPauseFocus() {}, onResumeFocus() {}, timerBusy: false, timerError: null,
  onTag: () => undefined, onOpenTimer: () => undefined, onCloseTimer: () => undefined, onStartTimer: () => undefined, onStopTimer: () => undefined, onCancelTimer: () => undefined,
}
const partial = mk([T('a','英語','英単語 Unit 3 の確認テスト', null), T('b','数学','方程式の文章題 5問', '2026-10-09T08:05:00Z'), T('c','国語','漢字ドリル p.12', null, true)])
const none = mk([T('a','英語','英単語 Unit 3 の確認テスト', null), T('b','数学','方程式の文章題 5問', null)], { streak: { current: 0, longest: 21 }, activity: [] })
const all = mk([T('b','数学','方程式の文章題 5問', '2026-10-09T08:05:00Z'), T('a','英語','英単語 Unit 3 の確認テスト', '2026-10-09T09:40:00Z')])
const empty = mk([])
const doneResult = { userTaskId: 'b', completedAt: '2026-10-09T08:05:00Z', alreadyCompleted: false, completedToday: 2, currentDays: 12, longestDays: 21 }
const screens: Record<string, React.ReactNode> = {
  partial: <HomeView {...base} data={partial} />,
  none: <HomeView {...base} data={none} />,
  support: <HomeView {...base} data={{ ...partial, support: { body: '今週も続けているね。数学の文章題、がんばっていました。', createdAt: '2026-10-08T09:00:00Z' } }} />,
  all: <HomeView {...base} data={all} />,
  empty: <HomeView {...base} data={empty} />,
  sheet: <HomeView {...base} data={partial} done={{ title: '方程式の文章題 5問', result: doneResult }} />,
  tagged: <HomeView {...base} data={none} notice="数学を記録しました　＋1コイン" />,
  timerSheet: <HomeView {...base} data={partial} timerOpen />,
  timerRunning: <HomeView {...base} data={{ ...partial, timer: { id: 't', subject: '英語', content: '英単語 20個', startedAt: new Date(Date.now() - 754000).toISOString(), focusTargetSeconds: null, pausedAt: null, pausedSeconds: 0 } }} />,
  focusSheet: <HomeView {...base} data={partial} timerOpen focusOpen />,
  focusRunning: <HomeView {...base} data={{ ...partial, timer: { id: 'f', subject: '数学', content: '二次関数', startedAt: new Date(Date.now() - 6 * 60000 - 20000).toISOString(), focusTargetSeconds: 900, pausedAt: null, pausedSeconds: 0 } }} />,
  focusDone: <HomeView {...base} data={partial} focusDone={{ subject: '数学', coins: 6, currentDays: 12 }} />,
  focusPaused: <HomeView {...base} data={{ ...partial, timer: { id: 'f', subject: '数学', content: null, startedAt: new Date(Date.now() - 9 * 60000).toISOString(), focusTargetSeconds: 900, pausedAt: new Date(Date.now() - 60000).toISOString(), pausedSeconds: 60 } }} />,
  free: <HomeView {...base} data={partial} freeOpen freeError="今日の自由登録は、3件までです。" />,
}
createRoot(document.getElementById('root')!).render(<div className="shell">{screens[location.hash.slice(1)]}</div>)
