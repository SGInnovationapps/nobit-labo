import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { loadClubs, loadMe } from './adminApi'
import type { Club, Me } from './adminApi'
import Approvals from './Approvals'
import ClubEvents from './ClubEvents'
import ClubSettings from './ClubSettings'
import { LoginForm } from './LoginForm'
import StudentDetailPage from './StudentDetail'
import Students from './Students'
import Tasks from './Tasks'
import './admin.css'

type Tab = 'students' | 'approvals' | 'events' | 'tasks' | 'clubs'
type Ready = { me: Me; clubs: Club[] }

function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

export default function AdminApp() {
  const session = useSession()
  if (session === undefined) return <div className="adm-center muted" role="status">読み込み中…</div>
  if (!session) return <LoginForm />
  return <Signed userId={session.user.id} />
}

function Signed({ userId }: { userId: string }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | ({ kind: 'ready' } & Ready)>({ kind: 'loading' })
  const [tab, setTab] = useState<Tab>('students')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [clubId, setClubId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const me = await loadMe()
      const clubs = me.role === 'student' ? [] : await loadClubs()
      setState({ kind: 'ready', me, clubs })
      setClubId((current) => (current && clubs.some((c) => c.id === current) ? current : (clubs[0]?.id ?? null)))
    } catch (e) {
      console.error(e)
      setState({ kind: 'error', message: '読み込めませんでした。通信を確認して、もう一度お試しください。' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, userId])

  const logout = () => void supabase.auth.signOut()

  if (state.kind === 'loading') return <div className="adm-center muted" role="status">読み込み中…</div>
  if (state.kind === 'error') {
    return (
      <div className="adm-center adm-stack">
        <p className="error" role="alert">{state.message}</p>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>もう一度読み込む</button>
        <button type="button" className="btn btn-quiet" onClick={logout}>ログアウト</button>
      </div>
    )
  }

  const { me, clubs } = state
  if (me.role === 'student') {
    return (
      <div className="adm-center adm-stack">
        <h1>この画面を使う権限がありません</h1>
        <p>管理画面を使えるのは、運営とクラブ管理者です。登録を確認するときは、運営に連絡してください。</p>
        <button type="button" className="btn btn-secondary" onClick={logout}>ログアウト</button>
      </div>
    )
  }

  const isOperator = me.role === 'operator'
  const club = clubs.find((c) => c.id === clubId) ?? null
  const activeTab: Tab = isOperator || tab === 'students' || tab === 'approvals' || tab === 'events' ? tab : 'students'

  return (
    <div className="adm-shell">
      <header className="adm-header">
        <div className="brand">NOBIT! 管理</div>
        <div className="adm-user">
          <span>{me.displayName ?? ''}（{isOperator ? '運営' : 'クラブ管理者'}）</span>
          <button type="button" className="btn btn-quiet adm-logout" onClick={logout}>ログアウト</button>
        </div>
      </header>

      <div className="adm-body">
        <nav className="adm-nav" aria-label="メニュー">
          <button type="button" className="adm-tab" aria-current={activeTab === 'students' ? 'page' : undefined} onClick={() => { setStudentId(null); setTab('students') }}>
            生徒一覧
          </button>
          <button type="button" className="adm-tab" aria-current={activeTab === 'approvals' ? 'page' : undefined} onClick={() => setTab('approvals')}>
            所属の承認
          </button>
          <button type="button" className="adm-tab" aria-current={activeTab === 'events' ? 'page' : undefined} onClick={() => setTab('events')}>
            大会日程
          </button>
          {isOperator && (
            <button type="button" className="adm-tab" aria-current={activeTab === 'tasks' ? 'page' : undefined} onClick={() => setTab('tasks')}>
              タスク管理
            </button>
          )}
          {isOperator && (
            <button type="button" className="adm-tab" aria-current={activeTab === 'clubs' ? 'page' : undefined} onClick={() => setTab('clubs')}>
              クラブ設定
            </button>
          )}
        </nav>

        <main className="adm-main">
          {clubs.length > 0 && (
            <div className="field adm-club-picker">
              <label htmlFor="club-picker">クラブ</label>
              <select id="club-picker" value={clubId ?? ''} onChange={(e) => { setClubId(e.target.value); setStudentId(null) }}>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'students' &&
            (club ? (
              studentId ? (
                <StudentDetailPage clubId={club.id} studentId={studentId} myId={me.userId} canComment={me.role === 'club_admin'} onBack={() => setStudentId(null)} />
              ) : (
                <Students clubId={club.id} onOpen={(st) => setStudentId(st.userId)} />
              )
            ) : (
              <p className="lead">{isOperator ? 'クラブがまだありません。「クラブ設定」から追加してください。' : '担当しているクラブがありません。運営に連絡してください。'}</p>
            ))}

          {activeTab === 'approvals' &&
            (club ? (
              <Approvals clubId={club.id} />
            ) : (
              <p className="lead">{isOperator ? 'クラブがまだありません。「クラブ設定」から追加してください。' : '担当しているクラブがありません。運営に連絡してください。'}</p>
            ))}

          {activeTab === 'events' &&
            (club ? <ClubEvents key={club.id} club={club} /> : <p className="lead">{isOperator ? 'クラブがまだありません。「クラブ設定」から追加してください。' : '担当しているクラブがありません。運営に連絡してください。'}</p>)}

          {activeTab === 'tasks' && (club ? <Tasks club={club} clubs={clubs} userId={me.userId} /> : <p className="lead">クラブがまだありません。「クラブ設定」から追加してください。</p>)}

          {activeTab === 'clubs' && (
            <ClubSettings
              club={club}
              onClubSaved={(saved) => setState((s) => (s.kind === 'ready' ? { ...s, clubs: s.clubs.map((c) => (c.id === saved.id ? saved : c)) } : s))}
              onClubCreated={(created) => {
                setState((s) => (s.kind === 'ready' ? { ...s, clubs: [...s.clubs, created] } : s))
                setClubId(created.id)
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}
