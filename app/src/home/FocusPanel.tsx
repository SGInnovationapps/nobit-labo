import { useEffect, useRef, useState } from 'react'
import { focusProgress } from './homeModel'

type Props = {
  timer: { subject: string; content: string | null; startedAt: string; pausedAt: string | null; pausedSeconds: number; focusTargetSeconds: number }
  busy: boolean
  error: string | null
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onCancel: () => void
}

/** 15分集中モード（画面03）：残り時間を大きく、1分 = 1目盛りの15目盛り */
export function FocusPanel({ timer, busy, error, onPause, onResume, onStop, onCancel }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const autoStopped = useRef(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const p = focusProgress(
    { startedAt: timer.startedAt, pausedAt: timer.pausedAt, pausedSeconds: timer.pausedSeconds, targetSeconds: timer.focusTargetSeconds },
    now,
  )

  // 残りが 0 になったら、自動で終えて記録する（1 回だけ）
  useEffect(() => {
    if (p.reached && !p.paused && !busy && !autoStopped.current) {
      autoStopped.current = true
      onStop()
    }
  }, [p.reached, p.paused, busy, onStop])

  const state = p.paused ? '一時停止中' : '集中中'

  return (
    <section className="section timer-panel focus-panel" aria-labelledby="focus-h">
      <h2 id="focus-h">15分集中　<span className="timer-subject">{timer.subject}</span></h2>
      {timer.content && <p className="timer-content">{timer.content}</p>}
      <p className="timer-time num" role="timer" aria-live="off">{p.label}</p>
      <p className="focus-state" role="status">{state}　{p.ticks} / 15分</p>
      <ol className="focus-ticks" aria-hidden="true">
        {Array.from({ length: 15 }, (_, i) => (
          <li key={i} className={i < p.ticks ? 'on' : ''} />
        ))}
      </ol>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {p.paused ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onResume}>再開する</button>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onPause}>一時停止</button>
        )}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onStop}>
          {busy ? '保存中…' : p.reached ? '記録する' : 'ここで終える'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>記録せずにやめる</button>
      </div>
    </section>
  )
}
