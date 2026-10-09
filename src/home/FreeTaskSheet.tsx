import { useState } from 'react'

const SUBJECTS = ['英語', '数学', '国語', '理科', '社会'] as const

type Props = {
  busy: boolean
  error: string | null
  onSubmit: (title: string, subject: string) => void
  onClose: () => void
}

/** やった勉強を記録する（自由登録）。教科は文字で選ぶ */
export function FreeTaskSheet({ busy, error, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState<string | null>(null)
  const ok = title.trim().length > 0 && title.trim().length <= 60 && subject !== null

  return (
    <div className="sheet-backdrop">
      <form
        className="sheet sheet-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-title"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok && !busy) onSubmit(title.trim(), subject!)
        }}
      >
        <h2 id="free-title" className="sheet-title">やった勉強を記録する</h2>
        <div className="field">
          <label htmlFor="free-name">内容</label>
          <input id="free-name" type="text" maxLength={60} value={title} placeholder="例：英単語 20個" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <fieldset className="choices choices-5">
          <legend>教科</legend>
          {SUBJECTS.map((s) => (
            <label key={s} className="choice">
              <input type="radio" name="subject" checked={subject === s} onChange={() => setSubject(s)} />
              <span className="choice-face">{s}</span>
            </label>
          ))}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={!ok || busy}>{busy ? '保存中…' : '追加する'}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>やめる</button>
        </div>
      </form>
    </div>
  )
}
