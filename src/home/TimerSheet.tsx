import { useState } from 'react'
import { FOCUS_DEFAULT_MINUTES, FOCUS_OPTIONS, focusBonusOf, SUBJECTS, validateContent } from './homeModel'
import type { FocusMinutes } from './homeModel'

type Props = {
  /** 集中モードで始めるとき（長さを選ぶ） */
  focus?: boolean
  busy: boolean
  error: string | null
  /** minutes は集中モードのときだけ（通常のタイマーは null） */
  onStart: (subject: string, content: string | null, minutes: FocusMinutes | null) => void
  onClose: () => void
}

/** タイマーを始める：教科を選び、内容を書いて（任意）、開始する */
export function TimerSheet({ focus = false, busy, error, onStart, onClose }: Props) {
  const [subject, setSubject] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [minutes, setMinutes] = useState<FocusMinutes>(FOCUS_DEFAULT_MINUTES)
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
          if (ok && !busy && check.ok) onStart(subject!, check.value, focus ? minutes : null)
        }}
      >
        <h2 id="timer-title" className="sheet-title">{focus ? '集中する' : 'タイマーで記録する'}</h2>
        {focus && (
          <fieldset className="choices choices-3">
            <legend>時間</legend>
            {FOCUS_OPTIONS.map((o) => (
              <label key={o.minutes} className="choice">
                <input type="radio" name="focus-minutes" checked={minutes === o.minutes} onChange={() => setMinutes(o.minutes)} />
                <span className="choice-face"><span className="num">{o.minutes}</span>分</span>
              </label>
            ))}
          </fieldset>
        )}
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
        {focus && <p className="muted">{minutes}分間、残り時間を数えます。一時停止もできます。最後まで続けると 🪙{focusBonusOf(minutes)}。ごほうびは1日1回です。</p>}
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
