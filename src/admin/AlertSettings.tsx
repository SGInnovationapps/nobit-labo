import { useCallback, useEffect, useState } from 'react'
import type { Club } from './adminApi'
import { loadAlertHistory, loadAlertRules, saveAlertRule } from './adminApi'
import { historyOutcome, isSettled, summarizeHistory } from './alertListModel'
import type { AlertItem } from './alertListModel'
import { dateLabel, jstDate, timeLabel } from '../home/homeModel'
import { gradeLabel } from '../lib/steps'
import { ALERT_DEFS, conditionText, defOf, isDirty, ruleProblem, saveErrorMessage, sortRules, TEMPLATE_MAX, THRESHOLD_MAX, THRESHOLD_MIN } from './alertsModel'
import type { AlertRule } from './alertsModel'

type RowProps = {
  rule: AlertRule
  busy: boolean
  onSave: (r: AlertRule) => void
}

function RuleRow({ rule, busy, onSave }: RowProps) {
  const def = defOf(rule.kind)
  const [draft, setDraft] = useState(rule)
  useEffect(() => setDraft(rule), [rule])
  const problem = ruleProblem(draft)
  const dirty = isDirty(draft, rule)
  const id = `alert-${rule.kind}`

  return (
    <section className="adm-section alert-rule" aria-labelledby={`${id}-h`}>
      <div className="alert-head">
        <h2 id={`${id}-h`}>{def.label}{def.provisional && <span className="alert-prov">［仮］</span>}</h2>
        <fieldset className="choices adm-choices alert-onoff">
          <legend className="adm-sr">{def.label}を使うか</legend>
          {[{ on: true, label: 'オン' }, { on: false, label: 'オフ' }].map((o) => (
            <label className="choice" key={o.label}>
              <input type="radio" name={`${id}-on`} checked={draft.enabled === o.on} disabled={busy} onChange={() => setDraft({ ...draft, enabled: o.on })} />
              <span className="choice-face">{o.label}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <p className="alert-cond">出る条件：{conditionText(draft)}</p>
      {rule.kind === 'gap' && (
        <div className="field alert-days">
          <label htmlFor={`${id}-days`}>空いた日数（{THRESHOLD_MIN}〜{THRESHOLD_MAX}日）</label>
          <input
            id={`${id}-days`}
            type="number"
            inputMode="numeric"
            min={THRESHOLD_MIN}
            max={THRESHOLD_MAX}
            value={draft.thresholdDays ?? ''}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, thresholdDays: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>
      )}

      <fieldset className="choices adm-choices alert-method">
        <legend>送り方</legend>
        <label className="choice">
          <input type="radio" name={`${id}-m`} checked={draft.sendMethod === 'manual'} readOnly />
          <span className="choice-face">手動チャット</span>
        </label>
        <label className="choice is-disabled">
          <input type="radio" name={`${id}-m`} disabled />
          <span className="choice-face">自動送信</span>
        </label>
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-t`}>送る文面のひな型（{TEMPLATE_MAX}文字まで）</label>
        <textarea id={`${id}-t`} rows={3} value={draft.template} disabled={busy} onChange={(e) => setDraft({ ...draft, template: e.target.value })} />
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}

      <div className="adm-actions-row">
        <button type="button" className="btn btn-secondary" disabled={busy || !dirty || problem !== null} onClick={() => onSave({ ...draft, template: draft.template.trim() })}>
          保存する
        </button>
        <button type="button" className="btn btn-quiet" disabled={busy || draft.template === def.defaultTemplate} onClick={() => setDraft({ ...draft, template: def.defaultTemplate })}>
          初期の文面に戻す
        </button>
      </div>
    </section>
  )
}

type ViewProps = {
  clubName: string
  rules: AlertRule[]
  busy: boolean
  error: string | null
  notice: string | null
  history: AlertItem[]
  now: number
  onSave: (r: AlertRule) => void
}

function History({ history, now }: { history: AlertItem[]; now: number }) {
  const summary = summarizeHistory(history, ALERT_DEFS.map((d) => d.kind))
  const recent = history.slice(0, 20)
  return (
    <section className="adm-section alert-history" aria-labelledby="alert-history-h">
      <h2 id="alert-history-h">連絡の履歴<span className="adm-grade">直近90日</span></h2>
      {history.length === 0 ? (
        <p className="muted">まだ「連絡済み」の記録がありません。生徒一覧の「対応アラート」から記録すると、ここに出ます。</p>
      ) : (
        <>
          <p className="muted">効果は、「連絡済み」を記録したあとの完了タスク数で見ます。連絡から7日たっていないものは、数字がこれから増えます。</p>
          <div className="alert-table-wrap">
            <table className="alert-table">
              <caption className="adm-sr">アラートの種類ごとの連絡の結果</caption>
              <thead>
                <tr><th scope="col">種類</th><th scope="col">連絡した</th><th scope="col">学習を再開</th><th scope="col">連絡後に1件以上完了</th><th scope="col">連絡後の完了（合計）</th></tr>
              </thead>
              <tbody>
                {summary.map((x) => (
                  <tr key={x.kind}>
                    <th scope="row">{defOf(x.kind).label}</th>
                    <td><span className="num">{x.contacted}</span> 件</td>
                    <td><span className="num">{x.resumed}</span> 件</td>
                    <td><span className="num">{x.completedAny}</span> 件</td>
                    <td><span className="num">{x.completedTotal}</span> 件</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="alert-sub">最近の連絡（新しい順、最大20件）</h3>
          <ul className="alert-items">
            {recent.map((i) => (
              <li key={i.id} className="alert-item">
                <div className="alert-item-head">
                  <p className="adm-name">{i.displayName ?? '（表示名が未入力）'}<span className="adm-grade">{i.grade !== null ? gradeLabel(i.grade) : ''}</span></p>
                  <p className="alert-kind">{defOf(i.kind).label}</p>
                </div>
                <p className="alert-status">連絡済み　{dateLabel(jstDate(i.contactedAt as string))} {timeLabel(i.contactedAt as string)}</p>
                <p className="alert-outcome">{historyOutcome(i)}{!isSettled(i.contactedAt as string, now) && <span className="muted">　（集計中）</span>}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export function AlertSettingsView({ clubName, rules, busy, error, notice, history, now, onSave }: ViewProps) {
  return (
    <>
      <div className="adm-title-row">
        <h1 className="adm-h1">アラートの設定<span className="adm-grade">{clubName}</span></h1>
      </div>
      <p className="muted">アラートの種類ごとに、オンオフ・条件・送る文面を決めます。アラートが出たら、運営が文面をコピーして公式LINE のチャットから1人ずつ送り、「連絡済み」を記録します。自動送信は、Messaging API の push に切り替えるときに使えるようになります。</p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="adm-notice" role="status">{notice}</p>}
      {rules.map((r) => (
        <RuleRow key={r.kind} rule={r} busy={busy} onSave={onSave} />
      ))}
      <History history={history} now={now} />
    </>
  )
}

export default function AlertSettings({ club }: { club: Club }) {
  const [rules, setRules] = useState<AlertRule[] | null>(null)
  const [history, setHistory] = useState<AlertItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [r, h] = await Promise.all([loadAlertRules(club.id), loadAlertHistory(club.id)])
    setRules(sortRules(r))
    setHistory(h)
  }, [club.id])

  useEffect(() => {
    setRules(null)
    reload().catch((e) => {
      console.error(e)
      setError('設定を読み込めませんでした。')
    })
  }, [reload])

  async function save(r: AlertRule) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await saveAlertRule(club.id, r)
      await reload()
      setNotice(`「${defOf(r.kind).label}」の設定を保存しました。`)
    } catch (e) {
      console.error(e)
      setError(saveErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!rules) return error ? <p className="error" role="alert">{error}</p> : <p className="lead">読み込み中です…</p>
  return <AlertSettingsView clubName={club.name} rules={rules} busy={busy} error={error} notice={notice} history={history} now={Date.now()} onSave={(r) => void save(r)} />
}
