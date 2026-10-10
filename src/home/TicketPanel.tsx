import { useState } from 'react'
import { ticketNote } from './homeModel'
import type { TicketInfo } from './homeModel'

type Props = {
  info: TicketInfo
  busy: boolean
  error: string | null
  /** 'today' か 'yesterday' */
  onUse: (which: 'today' | 'yesterday') => void
}

/** 休息チケット：所持数、使える日、使う前の確認。連続記録だけを守り、学習日には数えない */
export function TicketPanel({ info, busy, error, onUse }: Props) {
  const [confirm, setConfirm] = useState<'today' | 'yesterday' | null>(null)
  const canUse = info.balance > 0 && (info.canProtectYesterday || info.canProtectToday)
  return (
    <section className="section tickets" aria-labelledby="ticket-h">
      <h2 id="ticket-h" className="quests-title">
        休息チケット <span className="num quests-sum">{info.balance}</span> 枚
      </h2>
      <p className="ticket-note">{ticketNote(info)}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {canUse && !confirm && (
        <div className="ticket-actions">
          {info.canProtectYesterday && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirm('yesterday')}>昨日を休息日にする</button>
          )}
          {info.canProtectToday && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirm('today')}>今日を休息日にする</button>
          )}
        </div>
      )}
      {confirm && (
        <div className="ticket-confirm" role="group" aria-label="休息チケットを使う確認">
          <p>チケットを1枚使って、{confirm === 'yesterday' ? '昨日' : '今日'}を休息日にします。連続記録は続き、学習日には数えません。</p>
          <div className="ticket-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { const w = confirm; setConfirm(null); onUse(w) }}>
              {busy ? '使っています…' : '使う'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirm(null)}>やめる</button>
          </div>
        </div>
      )}
    </section>
  )
}
