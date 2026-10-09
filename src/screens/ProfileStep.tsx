import { useState } from 'react'
import { DISPLAY_NAME_MAX, GRADES, gradeLabel, validateDisplayName } from '../lib/steps'

type Props = {
  initialName: string | null
  initialGrade: number | null
  busy: boolean
  error: string | null
  onSubmit: (displayName: string, grade: number) => void
}

export function ProfileStep({ initialName, initialGrade, busy, error, onSubmit }: Props) {
  const [name, setName] = useState(initialName ?? '')
  const [grade, setGrade] = useState<number | null>(initialGrade)
  const nameCheck = validateDisplayName(name)
  const canSubmit = nameCheck.ok && grade !== null && !busy

  return (
    <>
      <h1>あなたのことを教えてください</h1>

      <div className="field">
        <label htmlFor="display-name">
          表示名
          <span className="count">
            <span className="num">{[...name.trim()].length}</span> / <span className="num">{DISPLAY_NAME_MAX}</span>
          </span>
        </label>
        <input
          id="display-name"
          type="text"
          value={name}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          aria-describedby="display-name-hint"
        />
        <p className="hint" id="display-name-hint">
          クラブの管理者に表示される名前です。
        </p>
      </div>

      <fieldset className="choices">
        <legend>学年</legend>
        {GRADES.map((g) => (
          <label className="choice" key={g.value}>
            <input
              type="radio"
              name="grade"
              value={g.value}
              checked={grade === g.value}
              onChange={() => setGrade(g.value)}
            />
            <span className="choice-face">{g.label}</span>
          </label>
        ))}
      </fieldset>
      <p className="selected-note" aria-live="polite">
        {grade === null ? '学年を選んでください' : `選んだ学年：${gradeLabel(grade)}`}
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!canSubmit}
        onClick={() => {
          if (nameCheck.ok && grade !== null) onSubmit(nameCheck.value, grade)
        }}
      >
        {busy ? '保存中…' : '次へ'}
      </button>
    </>
  )
}
