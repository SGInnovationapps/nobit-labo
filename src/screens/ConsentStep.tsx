import { useState } from 'react'
import { CONSENT_TEXT } from '../consentText'

type Props = {
  clubName: string | null
  scope: { version: number; summary: string }
  /** 閲覧範囲が変わったための取り直しか */
  reconsent: boolean
  busy: boolean
  error: string | null
  onSubmit: () => void
}

export function ConsentStep({ clubName, scope, reconsent, busy, error, onSubmit }: Props) {
  const [agreed, setAgreed] = useState(false)
  const sections = CONSENT_TEXT[scope.version]
  const club = clubName ?? 'クラブ'

  return (
    <>
      <h1>{reconsent ? '保護者の方へ：見られる範囲が変わりました' : '保護者の方へ'}</h1>
      <p className="lead">
        {reconsent
          ? `${club}で NOBIT! を続けるために、あらためて同意をお願いします。`
          : `${club}で NOBIT! を使うために、保護者の方の同意をお願いします。この画面は、保護者の方が確認してください。`}
      </p>

      {sections ? (
        sections.map((s) => (
          <section className="section" key={s.heading}>
            <h2>{s.heading}</h2>
            <p>{s.body}</p>
          </section>
        ))
      ) : (
        <section className="section">
          <p>{scope.summary}</p>
        </section>
      )}

      <p className="muted">
        同意の版：<span className="num">{scope.version}</span>
      </p>

      <label className="agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>保護者として、上記に同意します</span>
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary" disabled={!agreed || busy} onClick={onSubmit}>
        {busy ? '保存中…' : '同意して次へ'}
      </button>
    </>
  )
}
