import { useState } from 'react'
import { timeLabel, validateContent } from './homeModel'

type Props = {
  subject: string
  recordedAt: string
  /** 内容をすでに書いたか（書いたあとは「内容を直す」） */
  hasContent: boolean
  busy: boolean
  error: string | null
  onSaveContent: (content: string | null) => void
  onTimer: () => void
  onClose: () => void
}

/** 教科ボタンを押したあとの、任意の操作：内容を足す・この教科でタイマー。内容はクラブ管理者には見えない */
export function TagPanel({ subject, recordedAt, hasContent, busy, error, onSaveContent, onTimer, onClose }: Props) {
  const [writing, setWriting] = useState(false)
  const [content, setContent] = useState('')
  const check = validateContent(content)

  return (
    <div className="tag-panel" role="group" aria-label={`${subject}の記録`}>
      <p className="tag-panel-head"><span className="tag-panel-subject">{subject}</span>を記録しました　<span className="num">{timeLabel(recordedAt)}</span></p>
      {writing ? (
        <form
          className="tag-panel-form"
          onSubmit={(e) => { e.preventDefault(); if (check.ok && !busy) { onSaveContent(check.value); setWriting(false); setContent('') } }}
        >
          <div className="field">
            <label htmlFor="tag-content">内容（60文字まで。クラブの管理者には見えません）</label>
            <input id="tag-content" type="text" maxLength={60} value={content} placeholder="例：英単語 20個" onChange={(e) => setContent(e.target.value)} autoFocus />
          </div>
          {!check.ok && <p className="error" role="alert">{check.message}</p>}
          <div className="actions-inline">
            <button type="submit" className="btn btn-primary" disabled={busy || !check.ok}>保存する</button>
            <button type="button" className="btn btn-quiet" onClick={() => setWriting(false)}>やめる</button>
          </div>
        </form>
      ) : (
        <div className="actions-inline">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setWriting(true)}>{hasContent ? '内容を直す' : '内容を足す'}</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onTimer}>この教科でタイマー</button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>閉じる</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
