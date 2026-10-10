import { useCallback, useEffect, useState } from 'react'
import { dateLabel, jstDate, timeLabel } from '../home/homeModel'
import { gradeLabel } from '../lib/steps'
import {
  alertErrorMessage, canUndo, contactedToday, guidelineNote, lastRunNote, outcomeText, reasonText, sectionsOf,
} from './alertListModel'
import type { AlertItem, LastRun, StudentAlertRow } from './alertListModel'
import { dismissAlerts, loadAlertLastRun, loadAlerts, markAlertsContacted, undoAlertsContacted } from './adminApi'
import { defOf } from './alertsModel'

type RowProps = {
  row: StudentAlertRow
  mode: 'open' | 'extra' | 'contacted' | 'resolved'
  busy: boolean
  now: number
  onContacted: (row: StudentAlertRow) => void
  onDismiss: (row: StudentAlertRow) => void
  onUndo: (row: StudentAlertRow) => void
}

function AlertRow({ row, mode, busy, now, onContacted, onDismiss, onUndo }: RowProps) {
  const name = row.displayName ?? '（表示名が未入力）'
  const outcome = outcomeText(row.items[0])
  return (
    <li className="alert-item">
      <div className="alert-item-head">
        <p className="adm-name">
          {name}
          <span className="adm-grade">{row.grade !== null ? gradeLabel(row.grade) : ''}</span>
          {row.lineName && <span className="alert-line-name">LINE：{row.lineName}</span>}
        </p>
        <p className="alert-kind">{row.items.map((i) => defOf(i.kind).label).join('・')}</p>
      </div>
      <ul className="alert-reasons">
        {row.items.map((i: AlertItem) => (
          <li key={i.id} className="alert-reason">
            {reasonText(i.kind, i.detail)}　<span className="muted">{dateLabel(i.occurredOn)}</span>
          </li>
        ))}
      </ul>
      {mode === 'contacted' && row.contactedAt && (
        <p className="alert-status">連絡済み　{dateLabel(jstDate(row.contactedAt))} {timeLabel(row.contactedAt)}</p>
      )}
      {outcome && <p className="alert-outcome">{outcome}</p>}
      {(mode === 'open' || mode === 'extra') && (
        <>
          <p className="alert-template" aria-label="送る文面">{row.text}</p>
          <div className="adm-actions-row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onContacted(row)}>
              コピーして連絡済み<span className="adm-sr">（{name}）</span>
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onDismiss(row)}>
              見送る<span className="adm-sr">（{name}）</span>
            </button>
          </div>
        </>
      )}
      {mode === 'contacted' && canUndo(row.contactedAt, now) && (
        <div className="adm-actions-row">
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onUndo(row)}>
            連絡済みを取り消す<span className="adm-sr">（{name}）</span>
          </button>
        </div>
      )}
    </li>
  )
}

type ViewProps = {
  items: AlertItem[]
  busy: boolean
  error: string | null
  notice: string | null
  /** 直前に連絡済みにした行（取り消しボタンを出す） */
  undoRow?: StudentAlertRow | null
  onContacted: (row: StudentAlertRow) => void
  onDismiss: (row: StudentAlertRow) => void
  onUndo: (row: StudentAlertRow) => void
  lastRun?: LastRun
  now?: number
}

export function AlertListView({ items, busy, error, notice, undoRow, onContacted, onDismiss, onUndo, lastRun, now }: ViewProps) {
  const nowMs = now ?? Date.now()
  const run = lastRun === undefined ? null : lastRunNote(lastRun, nowMs)
  const s = sectionsOf(items)
  const today = jstDate(nowMs)
  const guide = guidelineNote(contactedToday(items, today))
  const rowProps = { busy, now: nowMs, onContacted, onDismiss, onUndo }
  const none = s.open.length === 0 && s.contacted.length === 0 && s.extra.length === 0
  return (
    <section className="adm-section alert-list" aria-labelledby="alerts-h">
      <h2 id="alerts-h">対応アラート<span className="adm-grade">対応待ち {s.open.length}人</span></h2>
      <p className="muted">「コピーして連絡済み」で文面をコピーし、その場で連絡済みに記録します。公式LINE のチャットから1人ずつ送ってください。</p>
      <p className={guide.warn ? 'alert-run alert-run-warn' : 'alert-run muted'}>{guide.text}</p>
      {run && <p className={run.warn ? 'alert-run alert-run-warn' : 'alert-run muted'}>{run.text}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && (
        <p className="adm-notice" role="status">
          {notice}
          {undoRow && (
            <button type="button" className="btn-link" disabled={busy} onClick={() => onUndo(undoRow)}>取り消す</button>
          )}
        </p>
      )}

      {none ? (
        <p className="muted">いま対応が必要なアラートはありません。</p>
      ) : (
        <>
          {s.open.length > 0 && (
            <ul className="alert-items" aria-label="対応待ち">
              {s.open.map((r) => <AlertRow key={r.studentId} row={r} mode="open" {...rowProps} />)}
            </ul>
          )}
          {s.contacted.length > 0 && (
            <>
              <h3 className="alert-sub">連絡済み（再開を待っています）</h3>
              <ul className="alert-items" aria-label="連絡済み">
                {s.contacted.map((r) => <AlertRow key={r.studentId} row={r} mode="contacted" {...rowProps} />)}
              </ul>
            </>
          )}
          {s.extra.length > 0 && (
            <>
              <h3 className="alert-sub">余裕があれば（お祝い）</h3>
              <p className="muted">アプリの中でも伝えています。送らなくても大丈夫です。</p>
              <ul className="alert-items" aria-label="余裕があれば">
                {s.extra.map((r) => <AlertRow key={r.studentId} row={r} mode="extra" {...rowProps} />)}
              </ul>
            </>
          )}
        </>
      )}

      {s.resolved.length > 0 && (
        <>
          <h3 className="alert-sub">最近解消した（7日以内）</h3>
          <ul className="alert-items" aria-label="最近解消した">
            {s.resolved.map((r) => <AlertRow key={r.studentId} row={r} mode="resolved" {...rowProps} />)}
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
  const [undoRow, setUndoRow] = useState<StudentAlertRow | null>(null)
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
    setUndoRow(null)
    void load()
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function act(action: () => Promise<void>, done: string, undo: StudentAlertRow | null = null) {
    setBusy(true)
    setError(null)
    setNotice(null)
    setUndoRow(null)
    try {
      await action()
      setNotice(done)
      setUndoRow(undo)
    } catch (e) {
      console.error(e)
      setError(alertErrorMessage(e))
    } finally {
      await load()
      setBusy(false)
    }
  }

  async function copyAndMark(row: StudentAlertRow) {
    // コピーできなかったときは、連絡済みにしない
    try {
      await navigator.clipboard.writeText(row.text)
    } catch {
      throw new Error('clipboard')
    }
    await markAlertsContacted(row.ids)
  }

  if (!items) return error ? <p className="error" role="alert">{error}</p> : null
  return (
    <AlertListView
      items={items}
      busy={busy}
      error={error}
      notice={notice}
      undoRow={undoRow}
      onContacted={(r) => void act(() => copyAndMark(r), `${r.displayName ?? '生徒'}さんの文面をコピーし、連絡済みに記録しました。`, r)}
      onDismiss={(r) => void act(() => dismissAlerts(r.ids), '見送りました。')}
      onUndo={(r) => void act(() => undoAlertsContacted(r.ids), '連絡済みを取り消しました。')}
      lastRun={lastRun}
    />
  )
}
