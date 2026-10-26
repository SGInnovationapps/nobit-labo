import { useEffect, useState } from 'react'
import { adjustStudentCoins, loadStudentAdminActions } from './adminApi'
import type { AdminAction } from './adminApi'
import { ADJUST_NOTE_MAX, adjustError, coinAmountLabel } from './studentModel'

type Props = {
  studentId: string
  /** いまの残高。調整したあとは onDone で読み直す */
  balance: number
  onDone: () => void
}

const stamp = (at: string) => {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const j = new Date(d.getTime() + 9 * 3600 * 1000)
  return `${j.getUTCFullYear()}/${j.getUTCMonth() + 1}/${j.getUTCDate()} ${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}`
}

/**
 * 運営だけの、コインの調整と操作履歴（画面10）。
 * 理由を必ず書かせ、だれが・いつ・いくら・なぜを残す。履歴はあとから書き換えられない。
 */
export function CoinAdjust({ studentId, balance, onDone }: Props) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [actions, setActions] = useState<AdminAction[]>([])
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    loadStudentAdminActions(studentId).then(
      (r) => { if (live) setActions(r) },
      (e) => { console.error(e); if (live) setActions([]) },
    )
    return () => { live = false }
  }, [studentId, reload])

  async function submit() {
    const err = adjustError(amount, note, balance)
    setShown(err)
    if (err) return
    setBusy(true)
    setNotice(null)
    try {
      const next = await adjustStudentCoins(studentId, Number(amount.trim()), note)
      setNotice(`${coinAmountLabel(Number(amount.trim()))} しました。残高は ${next} です。`)
      setAmount('')
      setNote('')
      setOpen(false)
      setReload((n) => n + 1)
      onDone()
    } catch (e) {
      console.error(e)
      setShown('調整できませんでした。通信を確認して、もう一度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-adjust">
      {!open && (
        <button type="button" className="btn btn-secondary adm-adjust-open" onClick={() => { setOpen(true); setNotice(null) }}>
          コインを調整する
        </button>
      )}
      {notice && <p className="adm-notice" role="status">{notice}</p>}

      {open && (
        <form
          className="adm-adjust-form"
          noValidate
          onSubmit={(e) => { e.preventDefault(); void submit() }}
        >
          <p className="adm-sub">増やすときは <span className="num">10</span>、減らすときは <span className="num">-10</span> のように入れます。理由は必ず残ります。</p>
          <div className="adm-form-grid">
            <div className="field">
              <label htmlFor="adj-amount">増減する数</label>
              <input id="adj-amount" type="text" inputMode="numeric" value={amount} placeholder="例：-5" onChange={(e) => setAmount(e.target.value)} aria-invalid={!!shown} />
            </div>
            <div className="field">
              <label htmlFor="adj-note">理由（{ADJUST_NOTE_MAX}文字まで）</label>
              <input id="adj-note" type="text" maxLength={ADJUST_NOTE_MAX} value={note} placeholder="例：ガチャの不具合で二重に付いた分を戻す" onChange={(e) => setNote(e.target.value)} aria-invalid={!!shown} />
            </div>
          </div>
          {shown && <p className="error" role="alert">{shown}</p>}
          <div className="adm-actions-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '調整中…' : '調整する'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => { setOpen(false); setShown(null) }}>やめる</button>
          </div>
        </form>
      )}

      <h3 className="adm-h3">運営の操作履歴</h3>
      {actions.length === 0 ? (
        <p className="muted">調整した記録は、まだありません。</p>
      ) : (
        <ul className="adm-list adm-list-compact">
          {actions.map((a) => (
            <li className="adm-row adm-row-compact adm-coin-row" key={a.id}>
              <p className="adm-sub num">{stamp(a.createdAt)}</p>
              <p className="adm-name">{a.note}</p>
              <p className="adm-sub">{a.actorName ?? '（削除された運営）'}</p>
              <p className="num adm-coin-amount">{coinAmountLabel(Number(a.detail.amount ?? 0))}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
