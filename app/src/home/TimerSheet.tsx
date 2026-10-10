import { useState } from 'react'
import { SUBJECTS, validateContent } from './homeModel'

type Props = {
  /** 15分集中モードで始めるとき */
  focus?: boolean
  busy: boolean
  error: string | null
  onStart: (subject: string, content: string | null) => void
  onClose: () => void
}

/** タイマーを始める：教科を選び、内容を書いて（任意）、開始する */
export function TimerSheet({ focus = false, busy, error, onStart, onClose }: Props) {
  const [subject, setSubject] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const check = validateContent(content)
  const ok = subject !== null && check.ok

  return (
    <div className="sheet-backdrop">
      <form
        className="sheet sheet-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="timer-title"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok && !busy && check.ok) onStart(subject!, check.value)
        }}
      >
        <h2 id="timer-title" className="sheet-title">{focus ? '15分集中する' : 'タイマーで記録する'}</h2>
        <fieldset className="choices choices-5">
          <legend>教科</legend>
          {SUBJECTS.map((s) => (
            <label key={s} className="choice">
              <input type="radio" name="timer-subject" checked={subject === s} onChange={() => setSubject(s)} />
              <span className="choice-face">{s}</span>
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="timer-content">やる内容（書かなくても始められます）</label>
          <input id="timer-content" type="text" maxLength={60} value={content} placeholder="例：英単語 20個" onChange={(e) => setContent(e.target.value)} />
        </div>
        <p className="muted">内容を書いて終えると3コイン、書かないときは1日1コインまでです。</p>
        {focus && <p className="muted">15分間、残り時間を数えます。一時停止もできます。最後まで続けると、1日1回、5コインがもらえます。</p>}
        {!check.ok && <p className="error" role="alert">{check.message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={!ok || busy}>{busy ? '開始中…' : '開始する'}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>やめる</button>
        </div>
      </form>
    </div>
  )
}
