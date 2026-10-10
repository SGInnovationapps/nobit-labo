import { useEffect, useState } from 'react'
import { elapsedLabel, elapsedMinutes, validateMinutes } from './homeModel'

type Props = {
  timer: { subject: string; content: string | null; startedAt: string }
  busy: boolean
  error: string | null
  onStop: (minutes: number | null) => void
  onCancel: () => void
}

/** 実行中のタイマー。終了し忘れたときは、学習した分数を直して終えられる */
export function TimerPanel({ timer, busy, error, onStop, onCancel }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [fixing, setFixing] = useState(false)
  const [minutes, setMinutes] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const max = elapsedMinutes(timer.startedAt, now)
  const check = validateMinutes(minutes, max)

  return (
    <section className="section timer-panel" aria-labelledby="timer-h">
      <h2 id="timer-h">タイマー　<span className="timer-subject">{timer.subject}</span></h2>
      {timer.content && <p className="timer-content">{timer.content}</p>}
      <p className="timer-time num" role="timer" aria-live="off">{elapsedLabel(timer.startedAt, now)}</p>
      {fixing && (
        <div className="field">
          <label htmlFor="timer-min">学習した分数（終了し忘れたとき。{max}分まで）</label>
          <input id="timer-min" type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          {minutes !== '' && !check.ok && <p className="error" role="alert">{check.message}</p>}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || (fixing && !check.ok)}
          onClick={() => onStop(fixing && check.ok ? check.value : null)}
        >
          {busy ? '保存中…' : fixing ? 'この分数で終える' : '終える'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setFixing((v) => !v)}>
          {fixing ? '分数を直さない' : '終了し忘れた'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>記録せずにやめる</button>
      </div>
    </section>
  )
}
