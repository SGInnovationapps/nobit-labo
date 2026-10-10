import { useCallback, useEffect, useState } from 'react'
import type { Club } from './adminApi'
import { loadAlertRules, saveAlertRule } from './adminApi'
import { conditionText, defOf, isDirty, ruleProblem, saveErrorMessage, sortRules, TEMPLATE_MAX, THRESHOLD_MAX, THRESHOLD_MIN } from './alertsModel'
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
  onSave: (r: AlertRule) => void
}

export function AlertSettingsView({ clubName, rules, busy, error, notice, onSave }: ViewProps) {
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
    </>
  )
}

export default function AlertSettings({ club }: { club: Club }) {
  const [rules, setRules] = useState<AlertRule[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => setRules(sortRules(await loadAlertRules(club.id))), [club.id])

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
  return <AlertSettingsView clubName={club.name} rules={rules} busy={busy} error={error} notice={notice} onSave={(r) => void save(r)} />
}
