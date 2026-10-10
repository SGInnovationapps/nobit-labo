import { useCallback, useEffect, useState } from 'react'
import { dateLabel, jstDate, timeLabel } from '../home/homeModel'
import { gradeLabel } from '../lib/steps'
import { alertErrorMessage, copyText, groupAlerts, lastRunNote, outcomeText, reasonText } from './alertListModel'
import type { AlertItem, LastRun } from './alertListModel'
import { dismissAlert, loadAlertLastRun, loadAlerts, markAlertContacted } from './adminApi'
import { defOf } from './alertsModel'

type ItemProps = {
  item: AlertItem
  busy: boolean
  onCopy: (text: string) => void
  onContacted: (id: string) => void
  onDismiss: (id: string) => void
  lastRun?: LastRun
  now?: number
}

function AlertRow({ item, busy, onCopy, onContacted, onDismiss }: ItemProps) {
  const text = copyText(item.kind, item.template, item.detail)
  const outcome = outcomeText(item)
  const name = item.displayName ?? '（表示名が未入力）'
  return (
    <li className="alert-item">
      <div className="alert-item-head">
        <p className="adm-name">
          {name}
          <span className="adm-grade">{item.grade !== null ? gradeLabel(item.grade) : ''}</span>
        </p>
        <p className="alert-kind">{defOf(item.kind).label}</p>
      </div>
      <p className="alert-reason">{reasonText(item.kind, item.detail)}　<span className="muted">{dateLabel(item.occurredOn)}</span></p>
      {item.status === 'contacted' && item.contactedAt && (
        <p className="alert-status">連絡済み　{dateLabel(jstDate(item.contactedAt))} {timeLabel(item.contactedAt)}</p>
      )}
      {outcome && <p className="alert-outcome">{outcome}</p>}
      {item.status !== 'resolved' && (
        <>
          <p className="alert-template" aria-label="送る文面">{text}</p>
          <div className="adm-actions-row">
            <button type="button" className="btn btn-secondary" onClick={() => onCopy(text)}>
              文面をコピー<span className="adm-sr">（{name}）</span>
            </button>
            {item.status === 'open' && (
              <>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onContacted(item.id)}>
                  連絡済みにする<span className="adm-sr">（{name}）</span>
                </button>
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onDismiss(item.id)}>
                  見送る<span className="adm-sr">（{name}）</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </li>
  )
}

type ViewProps = {
  items: AlertItem[]
  busy: boolean
  error: string | null
  notice: string | null
  onCopy: (text: string) => void
  onContacted: (id: string) => void
  onDismiss: (id: string) => void
  lastRun?: LastRun
  now?: number
}

export function AlertListView({ items, busy, error, notice, onCopy, onContacted, onDismiss, lastRun, now }: ViewProps) {
  const run = lastRun === undefined ? null : lastRunNote(lastRun, now ?? Date.now())
  const g = groupAlerts(items)
  const rowProps = { busy, onCopy, onContacted, onDismiss }
  return (
    <section className="adm-section alert-list" aria-labelledby="alerts-h">
      <h2 id="alerts-h">対応アラート<span className="adm-grade">対応待ち {g.open.length}件</span></h2>
      <p className="muted">文面をコピーして、公式LINE のチャットから1人ずつ送り、送ったら「連絡済みにする」を押します。</p>
      {run && <p className={run.warn ? 'alert-run alert-run-warn' : 'alert-run muted'}>{run.text}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="adm-notice" role="status">{notice}</p>}

      {g.open.length === 0 && g.contacted.length === 0 ? (
        <p className="muted">いま対応が必要なアラートはありません。</p>
      ) : (
        <>
          {g.open.length > 0 && (
            <ul className="alert-items" aria-label="対応待ち">
              {g.open.map((i) => <AlertRow key={i.id} item={i} {...rowProps} />)}
            </ul>
          )}
          {g.contacted.length > 0 && (
            <>
              <h3 className="alert-sub">連絡済み（再開を待っています）</h3>
              <ul className="alert-items" aria-label="連絡済み">
                {g.contacted.map((i) => <AlertRow key={i.id} item={i} {...rowProps} />)}
              </ul>
            </>
          )}
        </>
      )}

      {g.resolved.length > 0 && (
        <>
          <h3 className="alert-sub">最近解消した（7日以内）</h3>
          <ul className="alert-items" aria-label="最近解消した">
            {g.resolved.map((i) => <AlertRow key={i.id} item={i} {...rowProps} />)}
          </ul>
        </>
      )}
    </section>
  )
}

export default function AlertList({ clubId }: { clubId: string }) {
  const [items, setItems] = useState<AlertItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<LastRun | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      setItems(await loadAlerts(clubId))
      setLastRun(await loadAlertLastRun())
    } catch (e) {
      console.error(e)
      setError('アラートを読み込めませんでした。')
    }
  }, [clubId])

  useEffect(() => {
    setItems(null)
    setError(null)
    setNotice(null)
    void load()
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function act(action: () => Promise<void>, done: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(done)
    } catch (e) {
      console.error(e)
      setError(alertErrorMessage(e))
    } finally {
      await load()
      setBusy(false)
    }
  }

  if (!items) return error ? <p className="error" role="alert">{error}</p> : null
  return (
    <AlertListView
      items={items}
      busy={busy}
      error={error}
      notice={notice}
      onCopy={(t) => void act(async () => { await navigator.clipboard.writeText(t) }, '文面をコピーしました。')}
      onContacted={(id) => void act(() => markAlertContacted(id), '連絡済みに記録しました。')}
      onDismiss={(id) => void act(() => dismissAlert(id), '見送りました。')}
      lastRun={lastRun}
    />
  )
}
