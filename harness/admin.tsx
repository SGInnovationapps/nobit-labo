import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import '../src/admin/admin.css'
import { ApprovalsView } from '../src/admin/Approvals'
import { ClubSettingsView } from '../src/admin/ClubSettings'
import { TasksView } from '../src/admin/Tasks'
import type { AdminTask } from '../src/admin/taskModel'
import { StudentsView } from '../src/admin/Students'
import { StudentDetailView } from '../src/admin/StudentDetail'
import type { StudentRow } from '../src/admin/studentModel'
import { ClubEventsView } from '../src/admin/ClubEvents'
import { LoginForm } from '../src/admin/LoginForm'
import type { Applicant } from '../src/admin/applicants'

const noop = () => undefined
const apps: Applicant[] = [
  { membershipId: '1', userId: 'u1', displayName: 'ノビ太', grade: 8, status: 'pending', createdAt: '2026-10-09T00:51:00Z', reviewedAt: null, consentedVersions: [1] },
  { membershipId: '2', userId: 'u2', displayName: 'しずか', grade: 9, status: 'pending', createdAt: '2026-10-08T10:20:00Z', reviewedAt: null, consentedVersions: [] },
  { membershipId: '3', userId: 'u3', displayName: null, grade: null, status: 'pending', createdAt: '2026-10-08T09:00:00Z', reviewedAt: null, consentedVersions: [1] },
  { membershipId: '4', userId: 'u4', displayName: 'スネ夫', grade: 10, status: 'approved', createdAt: '2026-10-01T10:20:00Z', reviewedAt: '2026-10-02T03:00:00Z', consentedVersions: [1] },
]
const club = { id: 'c1', name: '［クラブ名］', inviteCode: 'abcdef123456', allowFreeTasks: true }
function Frame({ children, tab }: { children: React.ReactNode; tab: string }) {
  return (
    <div className="adm-shell">
      <header className="adm-header"><div className="brand">NOBIT! 管理</div><div className="adm-user"><span>運営（運営）</span><button className="btn btn-quiet adm-logout">ログアウト</button></div></header>
      <div className="adm-body">
        <nav className="adm-nav"><button className="adm-tab" aria-current={tab === 's' ? 'page' : undefined}>生徒一覧</button><button className="adm-tab" aria-current={tab === 'a' ? 'page' : undefined}>所属の承認</button><button className="adm-tab" aria-current={tab === 'e' ? 'page' : undefined}>大会日程</button><button className="adm-tab" aria-current={tab === 't' ? 'page' : undefined}>タスク管理</button><button className="adm-tab" aria-current={tab === 'c' ? 'page' : undefined}>クラブ設定</button></nav>
        <main className="adm-main">
          <div className="field adm-club-picker"><label>クラブ</label><select><option>［クラブ名］</option></select></div>
          {children}
        </main>
      </div>
    </div>
  )
}
const T = (o: Partial<AdminTask>): AdminTask => ({ id: Math.random().toString(), clubId: 'c1', title: '', subject: '英語', startsOn: '2026-10-09', dueOn: null, recurrence: 'daily', estimatedMinutes: null, archivedAt: null, ...o })
const board = {
  students: 12,
  doneToday: {} as Record<string, number>,
  tasks: [
    T({ id: 'a', title: '英単語 Unit 3 の確認テスト', subject: '英語', startsOn: '2026-10-01', estimatedMinutes: 15 }),
    T({ id: 'b', title: '方程式の文章題 5問', subject: '数学', startsOn: '2026-10-05', dueOn: '2026-10-31', recurrence: 'weekdays', estimatedMinutes: 20 }),
    T({ id: 'c', title: '漢字ドリル p.12', subject: '国語', startsOn: '2026-10-02', recurrence: 'weekly' }),
    T({ id: 'd', title: '理科 第3回 まとめ', subject: '理科', startsOn: '2026-10-14', recurrence: 'none' }),
    T({ id: 'e', title: '社会 年表づくり', subject: '社会', startsOn: '2026-09-20', dueOn: '2026-10-03' }),
  ],
}
board.doneToday = { a: 9, b: 4, c: 0 }
const tprops = { clubName: '［クラブ名］', board, today: '2026-10-09', error: null, notice: null, busy: false, busyId: null, canAllClubs: true, creating: false, onOpenCreate: noop, onCloseCreate: noop, onCreate: noop, onArchive: noop }
const D = (n: number) => { const d = new Date(Date.UTC(2026, 9, 9) - n * 86400000); return d.toISOString().slice(0, 10) }
const act14 = (pattern: number[]) => pattern.map((c, i) => ({ date: D(13 - i), count: c })).filter((a) => a.count > 0)
const stu = (o: Partial<StudentRow>): StudentRow => ({ userId: Math.random().toString(), displayName: 'ノビ太', grade: 8, assignedTotal: 2, assignedDone: 0, activityToday: 0, currentDays: 0, longestDays: 0, lastAchievedDate: null, activity: [], ...o })
const students: StudentRow[] = [
  stu({ displayName: 'しずか', grade: 9, longestDays: 14, lastAchievedDate: D(5), activity: act14([1,2,2,3,1,0,0,0,0,0,0,0,0,0]) }),
  stu({ displayName: 'ノビ太', grade: 8, currentDays: 0, longestDays: 3, lastAchievedDate: null }),
  stu({ displayName: 'スネ夫', grade: 10, currentDays: 4, longestDays: 9, lastAchievedDate: D(1), activity: act14([0,1,1,0,2,2,3,1,0,1,2,1,1,0]) }),
  stu({ displayName: 'ジャイ子', grade: 7, assignedDone: 1, activityToday: 1, currentDays: 8, longestDays: 12, lastAchievedDate: D(0), activity: act14([1,2,1,1,2,3,1,2,2,1,1,2,3,1]) }),
  stu({ displayName: 'デキ杉', grade: 11, assignedDone: 2, activityToday: 2, currentDays: 21, longestDays: 21, lastAchievedDate: D(0), activity: act14([2,3,2,3,3,2,2,3,3,2,3,3,2,3]) }),
]
const sboard = { students, clubActivity: [3,5,6,8,9,7,4,8,10,9,11,12,10,9].map((c, i) => ({ date: D(13 - i), count: c })) }
const detail = {
  student: students[3],
  studyDates: Array.from({ length: 60 }, (_, i) => D(i)).filter((_, i) => i % 7 !== 4 && i % 11 !== 3),
  history: [
    { id: '1', title: '方程式の文章題 5問', subject: '数学', completedAt: '2026-10-09T08:05:00Z' },
    { id: '2', title: '英単語 Unit 3 の確認テスト', subject: '英語', completedAt: '2026-10-08T09:40:00Z' },
    { id: '3', title: '漢字ドリル p.12', subject: '国語', completedAt: '2026-10-07T10:10:00Z' },
  ],
  subjects: ['数学','数学','英語','英語','英語','国語','理科'],
  comments: [{ id: 'c1', body: '今週も続けているね。\n数学の文章題、がんばっていました。', createdAt: '2026-10-08T09:00:00Z', mine: true }, { id: 'c2', body: '期末テスト、応援しています。', createdAt: '2026-10-01T09:00:00Z', mine: false }],
}
const dprops = { detail, today: '2026-10-09', canComment: true, busy: false, error: null, onBack: noop, onSend: noop, onDelete: noop }
const which = location.hash.slice(1)
const screens: Record<string, React.ReactNode> = {
  approvals: <Frame tab="a"><ApprovalsView applicants={apps} latestVersion={1} busyId={null} error={null} onApprove={noop} onReject={noop} /></Frame>,
  clubs: <Frame tab="c"><ClubSettingsView club={club} liffId="2001234567-AbCdEfGh" busy={false} error={null} notice="コピーしました。" onCreate={noop} onRename={noop} onSetFreeTasks={noop} onRegenerate={noop} onCopy={noop} /></Frame>,
  tasks: <Frame tab="t"><TasksView {...tprops} notice="配信しました。" /></Frame>,
  tasks_form: <Frame tab="t"><TasksView {...tprops} creating /></Frame>,
  tasks_empty: <Frame tab="t"><TasksView {...tprops} board={{ tasks: [], doneToday: {}, students: 0 }} /></Frame>,
  students: <Frame tab="s"><StudentsView board={sboard} today="2026-10-09" onOpen={noop} /></Frame>,
  student_detail: <Frame tab="s"><StudentDetailView {...dprops} /></Frame>,
  student_detail_op: <Frame tab="s"><StudentDetailView {...dprops} canComment={false} detail={{ ...detail, comments: [] }} /></Frame>,
  events: <Frame tab="e"><ClubEventsView clubName="［クラブ名］" today="2026-10-09" busy={false} error={null} notice="日程を追加しました。" onAdd={noop} onRemove={noop} events={[
    { id: 'e1', date: '2026-10-09', kind: 'camp', note: '秋合宿 2日目' },
    { id: 'e2', date: '2026-10-25', kind: 'tournament', note: '県大会' },
    { id: 'e3', date: '2026-11-15', kind: 'trip', note: null },
    { id: 'e4', date: '2026-09-20', kind: 'tournament', note: '地区大会' },
  ]} /></Frame>,
  events_empty: <Frame tab="e"><ClubEventsView clubName="［クラブ名］" today="2026-10-09" busy={false} error={null} notice={null} onAdd={noop} onRemove={noop} events={[]} /></Frame>,
  login: <LoginForm />,
}
createRoot(document.getElementById('root')!).render(screens[which] ?? <p>unknown</p>)
