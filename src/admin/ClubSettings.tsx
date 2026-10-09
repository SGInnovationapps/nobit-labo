import { useEffect, useState } from 'react'
import type { Club } from './adminApi'
import { createClub, regenerateInviteCode, updateClub } from './adminApi'
import { inviteUrl } from './applicants'
import { QrCode } from './QrCode'

const NAME_MAX = 80

type ViewProps = {
  club: Club | null
  liffId: string | undefined
  busy: boolean
  error: string | null
  notice: string | null
  onCreate: (name: string) => void
  onRename: (name: string) => void
  onSetFreeTasks: (on: boolean) => void
  onRegenerate: () => void
  onCopy: (text: string) => void
}

function nameError(raw: string): string | null {
  const n = [...raw.trim()].length
  if (n === 0) return 'クラブ名を入力してください'
  if (n > NAME_MAX) return `クラブ名は${NAME_MAX}文字までです`
  return null
}

export function ClubSettingsView({ club, liffId, busy, error, notice, onCreate, onRename, onSetFreeTasks, onRegenerate, onCopy }: ViewProps) {
  const [newName, setNewName] = useState('')
  const [name, setName] = useState(club?.name ?? '')
  const [confirmRegen, setConfirmRegen] = useState(false)

  useEffect(() => {
    setName(club?.name ?? '')
    setConfirmRegen(false)
  }, [club?.id, club?.name])

  const link = club && liffId ? inviteUrl(liffId, club.inviteCode) : null

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="adm-notice" role="status">
          {notice}
        </p>
      )}

      {club && (
        <>
          <section className="adm-section" aria-labelledby="adm-name">
            <h2 id="adm-name">クラブ名</h2>
            <div className="adm-inline-form">
              <div className="field">
                <label htmlFor="club-name" className="adm-sr">クラブ名</label>
                <input id="club-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || nameError(name) !== null || name.trim() === club.name}
                onClick={() => onRename(name.trim())}
              >
                名前を保存する
              </button>
            </div>
          </section>

          <section className="adm-section" aria-labelledby="adm-invite">
            <h2 id="adm-invite">招待リンクと招待QR</h2>
            {link ? (
              <>
                <p className="muted">生徒には、このリンクかQRコードを渡します。開くと、このクラブへの申し込みになります。</p>
                <div className="adm-inline-form">
                  <div className="field">
                    <label htmlFor="invite-link" className="adm-sr">招待リンク</label>
                    <input id="invite-link" type="text" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => onCopy(link)}>
                    リンクをコピーする
                  </button>
                </div>
                <QrCode url={link} filename="nobit-invite.png" />

                <div className="adm-regen">
                  {confirmRegen ? (
                    <>
                      <p className="adm-confirm">作り直すと、これまでのリンクとQRコードは使えなくなります。作り直しますか？</p>
                      <div className="adm-actions-row">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => {
                            setConfirmRegen(false)
                            onRegenerate()
                          }}
                        >
                          作り直す
                        </button>
                        <button type="button" className="btn btn-quiet" onClick={() => setConfirmRegen(false)}>
                          やめる
                        </button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="btn btn-quiet" onClick={() => setConfirmRegen(true)}>
                      招待コードを作り直す
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="error">VITE_LIFF_ID が設定されていないため、招待リンクを作れません。</p>
            )}
          </section>

          <section className="adm-section" aria-labelledby="adm-free">
            <h2 id="adm-free">生徒の自由登録</h2>
            <p className="muted">生徒が自分でタスクを登録できるかどうかを決めます。</p>
            <fieldset className="choices adm-choices">
              <legend className="adm-sr">生徒の自由登録</legend>
              {[
                { on: true, label: 'オン' },
                { on: false, label: 'オフ' },
              ].map((o) => (
                <label className="choice" key={o.label}>
                  <input
                    type="radio"
                    name="free-tasks"
                    checked={club.allowFreeTasks === o.on}
                    disabled={busy}
                    onChange={() => onSetFreeTasks(o.on)}
                  />
                  <span className="choice-face">{o.label}</span>
                </label>
              ))}
            </fieldset>
            <p className="muted" aria-live="polite">
              いまの設定：{club.allowFreeTasks ? 'オン（生徒が自由に登録できます）' : 'オフ（生徒は自由に登録できません）'}
            </p>
          </section>
        </>
      )}

      <section className="adm-section" aria-labelledby="adm-new">
        <h2 id="adm-new">クラブを追加する</h2>
        <div className="adm-inline-form">
          <div className="field">
            <label htmlFor="new-club" className="adm-sr">新しいクラブの名前</label>
            <input id="new-club" type="text" placeholder="クラブ名" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || nameError(newName) !== null}
            onClick={() => {
              onCreate(newName.trim())
              setNewName('')
            }}
          >
            追加する
          </button>
        </div>
      </section>
    </>
  )
}

type PageProps = {
  club: Club | null
  onClubSaved: (club: Club) => void
  onClubCreated: (club: Club) => void
}

export default function ClubSettingsPage({ club, onClubSaved, onClubCreated }: PageProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      if (done) setNotice(done)
    } catch (e) {
      console.error(e)
      setError('保存できませんでした。通信と権限を確認して、もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClubSettingsView
      club={club}
      liffId={import.meta.env.VITE_LIFF_ID as string | undefined}
      busy={busy}
      error={error}
      notice={notice}
      onCreate={(name) => void run(async () => onClubCreated(await createClub(name)), 'クラブを追加しました。')}
      onRename={(name) => void run(async () => { if (club) onClubSaved(await updateClub(club.id, { name })) }, 'クラブ名を保存しました。')}
      onSetFreeTasks={(on) => void run(async () => { if (club) onClubSaved(await updateClub(club.id, { allowFreeTasks: on })) }, '設定を保存しました。')}
      onRegenerate={() => void run(async () => { if (club) onClubSaved(await regenerateInviteCode(club.id)) }, '招待コードを作り直しました。')}
      onCopy={(text) =>
        void run(async () => {
          await navigator.clipboard.writeText(text)
        }, 'コピーしました。')
      }
    />
  )
}
