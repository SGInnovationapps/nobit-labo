import { useEffect, useState } from 'react'
import { loadContactAllowed, setContactAllowed } from './collectionApi'

type ViewProps = {
  /** null = 読み込み中 */
  allowed: boolean | null
  busy: boolean
  error: string | null
  onChange: (allowed: boolean) => void
}

/** 公式LINE からの連絡を受け取るかどうか。生徒が自分で切り替えられる（アプリの記録・応援には影響しない） */
export function ContactSettingView({ allowed, busy, error, onChange }: ViewProps) {
  return (
    <section className="section contact-setting" aria-labelledby="contact-h">
      <h2 id="contact-h">公式LINEからの連絡</h2>
      <p className="muted">NOBIT! 公式LINE から、学習に関する連絡が届くことがあります。いつでも切り替えられます。</p>
      {allowed === null ? (
        <p className="muted" role="status">読み込み中…</p>
      ) : (
        <fieldset className="choices" disabled={busy} aria-labelledby="contact-h">
          {[
            { on: true, label: '受け取る' },
            { on: false, label: '受け取らない' },
          ].map((o) => (
            <label className="choice" key={o.label}>
              <input type="radio" name="contact" checked={allowed === o.on} onChange={() => onChange(o.on)} />
              <span className="choice-face">{o.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {allowed === false && <p className="muted" aria-live="polite">連絡は届きません。記録や、クラブからの応援は、これまでどおり使えます。</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}

export function ContactSetting() {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadContactAllowed().then((v) => alive && setAllowed(v)).catch((e) => { console.error(e); if (alive) setError('読み込めませんでした。') })
    return () => { alive = false }
  }, [])

  async function onChange(next: boolean) {
    const prev = allowed
    setAllowed(next)
    setBusy(true)
    setError(null)
    try {
      await setContactAllowed(next)
    } catch (e) {
      console.error(e)
      setAllowed(prev)
      setError('切り替えられませんでした。通信を確認して、もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  // 公式LINE の行がない（LINE ログイン以外で入った）ときは出さない
  if (allowed === null && error) return null
  return <ContactSettingView allowed={allowed} busy={busy} error={error} onChange={(v) => void onChange(v)} />
}
