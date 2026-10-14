import { useEffect, useState } from 'react'
import { addClubAdmin, loadClubAdmins, removeClubAdmin } from './adminApi'
import { ADD_DONE, addProblem, ADMIN_NAME_MAX, adminErrorMessage, adminLabel } from './clubAdminsModel'
import type { ClubAdmin } from './clubAdminsModel'

type ViewProps = {
  clubName: string
  admins: ClubAdmin[] | null
  busy: boolean
  error: string | null
  notice: string | null
  onAdd: (email: string, name: string) => void
  onRemove: (a: ClubAdmin) => void
}

/** クラブ管理者の追加・解除（運営だけに出す） */
export function ClubAdminsView({ clubName, admins, busy, error, notice, onAdd, onRemove }: ViewProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const problem = addProblem(email, name)

  return (
    <section className="adm-section" aria-labelledby="adm-admins">
      <h2 id="adm-admins">クラブ管理者</h2>
      <p className="muted">{clubName}の管理者です。見られるのは、このクラブの完了したタスクと記録の帯までです。</p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="adm-notice" role="status">{notice}</p>}

      {admins === null ? (
        <p className="muted" role="status">読み込み中…</p>
      ) : admins.length === 0 ? (
        <p className="muted">管理者はまだいません。</p>
      ) : (
        <ul className="adm-admin-list">
          {admins.map((a) => (
            <li key={a.userId} className="adm-admin-row">
              <span className="adm-admin-name">{adminLabel(a)}</span>
              {target === a.userId ? (
                <span className="adm-admin-confirm">
                  <span>解除すると、管理画面に入れなくなります。</span>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setTarget(null); onRemove(a) }}>解除する</button>
                  <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setTarget(null)}>やめる</button>
                </span>
              ) : (
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setTarget(a.userId)}>解除</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="adm-admin-form">
        <div className="field">
          <label htmlFor="admin-email">メールアドレス</label>
          <input id="admin-email" type="email" inputMode="email" autoComplete="off" placeholder="admin@example.com" value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="admin-name">表示名（任意・{ADMIN_NAME_MAX}文字まで）</label>
          <input id="admin-name" type="text" placeholder="［管理者名］" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
          <p className="hint">生徒のホームの応援に「○○さんから：…」と出る名前です。</p>
        </div>
        {(email !== '' || name !== '') && problem && <p className="error" role="alert">{problem}</p>}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || problem !== null}
          onClick={() => { onAdd(email, name); setEmail(''); setName('') }}
        >
          管理者に追加する
        </button>
      </div>
    </section>
  )
}

export default function ClubAdmins({ clubId, clubName }: { clubId: string; clubName: string }) {
  const [admins, setAdmins] = useState<ClubAdmin[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setAdmins(null)
    setError(null)
    setNotice(null)
    loadClubAdmins(clubId).then((a) => alive && setAdmins(a)).catch((e) => { if (alive) { console.error(e); setError(adminErrorMessage(e)); setAdmins([]) } })
    return () => { alive = false }
  }, [clubId])

  async function run(action: () => Promise<ClubAdmin[]>, done: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setAdmins(await action())
      setNotice(done)
    } catch (e) {
      console.error(e)
      setError(adminErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClubAdminsView
      clubName={clubName}
      admins={admins}
      busy={busy}
      error={error}
      notice={notice}
      onAdd={(email, name) => void run(() => addClubAdmin(clubId, email.trim(), name.trim()), ADD_DONE)}
      onRemove={(a) => void run(() => removeClubAdmin(clubId, a.userId), `${adminLabel(a)} を解除しました。`)}
    />
  )
}
