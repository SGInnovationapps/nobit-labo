import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPhase('sending')
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // 管理画面に入れるのは登録済みの人だけ。新しいユーザーは作らない
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/admin` },
    })
    if (err) {
      setPhase('idle')
      setError(
        err.status === 429
          ? 'メールの送信回数が上限に達しました。しばらくしてから、もう一度お試しください。'
          : '送信できませんでした。登録されているメールアドレスか、確認してください。',
      )
      return
    }
    setPhase('sent')
  }

  return (
    <div className="adm-login">
      <div className="brand">NOBIT! 管理</div>
      <h1>ログイン</h1>
      {phase === 'sent' ? (
        <div className="adm-stack">
          <p>メールを送りました。届いたリンクを、この端末のブラウザで開いてください。</p>
          <p className="muted">届かないときは、迷惑メールのフォルダも確認してください。</p>
          <button type="button" className="btn btn-secondary" onClick={() => setPhase('idle')}>
            メールアドレスを入れ直す
          </button>
        </div>
      ) : (
        <form className="adm-stack" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="adm-email">メールアドレス</label>
            <input
              id="adm-email"
              type="text"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="hint">パスワードはありません。メールに届くリンクでログインします。</p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={phase === 'sending' || email.trim() === ''}>
            {phase === 'sending' ? '送信中…' : 'ログイン用のメールを送る'}
          </button>
        </form>
      )}
    </div>
  )
}
