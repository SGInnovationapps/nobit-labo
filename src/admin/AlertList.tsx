import { useCallback, useEffect, useState } from 'react'
import { dateLabel, jstDate, timeLabel } from '../home/homeModel'
import { gradeLabel } from '../lib/steps'
import {
  alertErrorMessage, canUndo, contactedToday, guidelineNote, lastRunNote, outcomeText, pushReasonText, pushResultNotice, quotaNote, reasonText, sectionsOf,
} from './alertListModel'
import type { AlertItem, LastRun, LineQuota, StudentAlertRow } from './alertListModel'
import {
  dismissAlerts, loadAlertLastRun, loadAlerts, loadClientErrors, loadLineQuota, markAlertsContacted, sendLinePush, undoAlertsContacted,
} from './adminApi'
import { clientErrorMeta, clientErrorNote } from './clientErrorsModel'
import type { ClientErrorItem } from './clientErrorsModel'
import { defOf } from './alertsModel'

type RowProps = {
  row: StudentAlertRow
  mode: 'open' | 'extra' | 'contacted' | 'resolved'
  busy: boolean
  now: number
  onContacted: (row: StudentAlertRow) => void
  onDismiss: (row: StudentAlertRow) => void
  onUndo: (row: StudentAlertRow) => void
  /** LINE で送る（確かめたあと）。渡されなければ、ボタンを出さない */
  onPush?: (rows: StudentAlertRow[]) => void
  /** 確かめている行（この行だけ「送る」を出す） */
  confirming: boolean
  onConfirm: (row: StudentAlertRow | null) => void
}

function AlertRow({ row, mode, busy, now, onContacted, onDismiss, onUndo, onPush, confirming, onConfirm }: RowProps) {
  const name = row.displayName ?? '（表示名が未入力）'
  const outcome = outcomeText(row.items[0])
  const canPush = mode === 'open' && !!onPush && row.push === 'ok'
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
      {row.blocked && <p className="alert-blocked" role="status">公式LINE：ブロック中。文面を送っても届きません。</p>}
      <ul className="alert-reasons">
        {row.items.map((i: AlertItem) => (
          <li key={i.id} className="alert-reason">
            {reasonText(i.kind, i.detail)}　<span className="muted">{dateLabel(i.occurredOn)}</span>
          </li>
        ))}
      </ul>
      {mode === 'contacted' && row.contactedAt && (
        <p className="alert-status">
          連絡済み{row.sentByLine ? '（LINEで送信）' : ''}　{dateLabel(jstDate(row.contactedAt))} {timeLabel(row.contactedAt)}
        </p>
      )}
      {outcome && <p className="alert-outcome">{outcome}</p>}
      {(mode === 'open' || mode === 'extra') && (
        <>
          <p className="alert-template" aria-label="送る文面">{row.text}</p>
          {mode === 'open' && onPush && row.push !== 'ok' && row.push !== 'not_kind' && (
            <p className="alert-push-note muted">{pushReasonText(row.push)}</p>
          )}
          {canPush && confirming ? (
            <div className="alert-confirm" role="group" aria-label={`${name}さんに LINE で送る`}>
              <p className="alert-confirm-text">この文面を、{name}さんの LINE に送ります（1通）。送ると連絡済みになり、取り消せません。</p>
              <div className="adm-actions-row">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onPush([row])}>
                  送る<span className="adm-sr">（{name}）</span>
                </button>
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onConfirm(null)}>やめる</button>
              </div>
            </div>
          ) : (
            <div className="adm-actions-row">
              {canPush && (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onConfirm(row)}>
                  LINEで送る<span className="adm-sr">（{name}）</span>
                </button>
              )}
              <button type="button" className={canPush ? 'btn btn-quiet' : 'btn btn-primary'} disabled={busy} onClick={() => onContacted(row)}>
                コピーして連絡済み<span className="adm-sr">（{name}）</span>
              </button>
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onDismiss(row)}>
                見送る<span className="adm-sr">（{name}）</span>
              </button>
            </div>
          )}
        </>
      )}
      {mode === 'contacted' && !row.sentByLine && canUndo(row.contactedAt, now) && (
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
  /** 画面のエラーの記録（直近7日）。読めなかったときは undefined で、何も出さない */
  clientErrors?: ClientErrorItem[]
  now?: number
  /** LINE の残り通数。読み込み中は undefined、確かめられなければ null */
  quota?: LineQuota | null
  /** LINE で送る。渡されなければ、送るボタンを出さない */
  onPush?: (rows: StudentAlertRow[]) => void
  /** 送ったあとに失敗が含まれていたら、注意の色で出す */
  noticeWarn?: boolean
}

export function AlertListView({
  items, busy, error, notice, undoRow, onContacted, onDismiss, onUndo, lastRun, clientErrors, now, quota, onPush, noticeWarn,
}: ViewProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const nowMs = now ?? Date.now()
  const run = lastRun === undefined ? null : lastRunNote(lastRun, nowMs)
  const s = sectionsOf(items)
  const today = jstDate(nowMs)
  const guide = guidelineNote(contactedToday(items, today))
  const push = onPush
    ? (rows: StudentAlertRow[]) => { setConfirmId(null); setBulkConfirm(false); onPush(rows) }
    : undefined
  const rowProps = {
    busy, now: nowMs, onContacted, onDismiss, onUndo, onPush: push,
    onConfirm: (r: StudentAlertRow | null) => { setBulkConfirm(false); setConfirmId(r ? r.studentId : null) },
  }
  const none = s.open.length === 0 && s.contacted.length === 0 && s.extra.length === 0
  const pushable = s.open.filter((r) => r.push === 'ok')
  const qn = quota === undefined ? null : quotaNote(quota)
  const short = quota?.remaining !== null && quota?.remaining !== undefined && quota.remaining < pushable.length
  return (
    <section className="adm-section alert-list" aria-labelledby="alerts-h">
      <h2 id="alerts-h">対応アラート<span className="adm-grade">対応待ち {s.open.length}人</span></h2>
      <p className="muted">
        {onPush
          ? '再開の声かけ（記録が空いた・連続記録が途切れた）は「LINEで送る」で、公式LINE から送れます（1人1通、月の通数に数えます）。ほかは「コピーして連絡済み」で文面をコピーし、公式LINE のチャットから送ってください。'
          : '「コピーして連絡済み」で文面をコピーし、その場で連絡済みに記録します。公式LINE のチャットから1人ずつ送ってください。'}
      </p>
      {qn && <p className={qn.warn ? 'alert-run alert-run-warn' : 'alert-run muted'}>{qn.text}</p>}
      <p className={guide.warn ? 'alert-run alert-run-warn' : 'alert-run muted'}>{guide.text}</p>
      {run && <p className={run.warn ? 'alert-run alert-run-warn' : 'alert-run muted'}>{run.text}</p>}
      {clientErrors && <ClientErrors items={clientErrors} now={nowMs} />}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && (
        <p className={noticeWarn ? 'adm-notice adm-notice-warn' : 'adm-notice'} role="status">
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
          {push && pushable.length >= 2 && (
            bulkConfirm ? (
              <div className="alert-confirm" role="group" aria-label="まとめて LINE で送る">
                <p className="alert-confirm-text">
                  再開の声かけ {pushable.length}人に、それぞれの文面を LINE で送ります（{pushable.length}通）。
                  {quota?.remaining != null && `今月の残りは ${quota.remaining}通から ${Math.max(0, quota.remaining - pushable.length)}通になります。`}
                  送ると連絡済みになり、取り消せません。
                </p>
                {short && <p className="error">今月の残りが足りません。1人ずつ選んで送るか、コピーして送ってください。</p>}
                <div className="adm-actions-row">
                  <button type="button" className="btn btn-primary" disabled={busy || short} onClick={() => push(pushable)}>{pushable.length}人に送る</button>
                  <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setBulkConfirm(false)}>やめる</button>
                </div>
              </div>
            ) : (
              <div className="adm-actions-row alert-bulk">
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { setConfirmId(null); setBulkConfirm(true) }}>
                  再開の声かけを、まとめて LINE で送る（{pushable.length}人）
                </button>
              </div>
            )
          )}
          {s.open.length > 0 && (
            <ul className="alert-items" aria-label="対応待ち">
              {s.open.map((r) => <AlertRow key={r.studentId} row={r} mode="open" confirming={confirmId === r.studentId} {...rowProps} />)}
            </ul>
          )}
          {s.contacted.length > 0 && (
            <>
              <h3 className="alert-sub">連絡済み（再開を待っています）</h3>
              <ul className="alert-items" aria-label="連絡済み">
                {s.contacted.map((r) => <AlertRow key={r.studentId} row={r} mode="contacted" confirming={false} {...rowProps} />)}
              </ul>
            </>
          )}
          {s.extra.length > 0 && (
            <>
              <h3 className="alert-sub">余裕があれば（お祝い）</h3>
              <p className="muted">アプリの中でも伝えています。送らなくても大丈夫です。</p>
              <ul className="alert-items" aria-label="余裕があれば">
                {s.extra.map((r) => <AlertRow key={r.studentId} row={r} mode="extra" confirming={false} {...rowProps} />)}
              </ul>
            </>
          )}
        </>
      )}

      {s.resolved.length > 0 && (
        <>
          <h3 className="alert-sub">最近解消した（7日以内）</h3>
          <ul className="alert-items" aria-label="最近解消した">
            {s.resolved.map((r) => <AlertRow key={r.studentId} row={r} mode="resolved" confirming={false} {...rowProps} />)}
          </ul>
        </>
      )}
    </section>
  )
}

/** 画面のエラー（直近7日）。ふだんは閉じておき、一文だけ見せる */
function ClientErrors({ items, now }: { items: ClientErrorItem[]; now: number }) {
  const note = clientErrorNote(items, now)
  if (items.length === 0) return <p className="alert-run muted">{note.text}</p>
  return (
    <details className="client-errors">
      <summary className={note.warn ? 'alert-run alert-run-warn' : 'alert-run muted'}>{note.text}</summary>
      <ul className="client-error-items" aria-label="画面のエラー">
        {items.map((i) => (
          <li key={i.id}>
            <p className="client-error-msg">{i.message}</p>
            <p className="muted">{clientErrorMeta(i)}</p>
            {i.stack && (
              <details>
                <summary className="muted">詳しく</summary>
                <pre className="client-error-stack">{[i.path ? `場所：${i.path}` : null, i.stack].filter(Boolean).join('\n')}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

export default function AlertList({ clubId }: { clubId: string }) {
  const [items, setItems] = useState<AlertItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [undoRow, setUndoRow] = useState<StudentAlertRow | null>(null)
  const [lastRun, setLastRun] = useState<LastRun | undefined>(undefined)
  const [clientErrors, setClientErrors] = useState<ClientErrorItem[] | undefined>(undefined)
  const [quota, setQuota] = useState<LineQuota | null | undefined>(undefined)
  const [noticeWarn, setNoticeWarn] = useState(false)

  const loadQuota = useCallback(async () => {
    try {
      setQuota(await loadLineQuota())
    } catch (e) {
      console.error(e)
      setQuota(null)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      setItems(await loadAlerts(clubId))
      setLastRun(await loadAlertLastRun())
      setClientErrors(await loadClientErrors())
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
    void loadQuota()
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  async function pushRows(rows: StudentAlertRow[]) {
    setBusy(true)
    setError(null)
    setNotice(null)
    setUndoRow(null)
    setNoticeWarn(false)
    try {
      const n = pushResultNotice(await sendLinePush(rows.map((r) => ({ alertIds: r.ids, text: r.text }))))
      setNotice(n.text)
      setNoticeWarn(n.failed)
    } catch (e) {
      console.error(e)
      setError(alertErrorMessage(e))
    } finally {
      await Promise.all([load(), loadQuota()])
      setBusy(false)
    }
  }

  async function act(action: () => Promise<void>, done: string, undo: StudentAlertRow | null = null) {
    setBusy(true)
    setError(null)
    setNotice(null)
    setUndoRow(null)
    setNoticeWarn(false)
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
      clientErrors={clientErrors}
      quota={quota}
      onPush={(rows) => void pushRows(rows)}
      noticeWarn={noticeWarn}
    />
  )
}
