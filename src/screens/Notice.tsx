import type { ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  /** 状態を文字でも示す（例：承認待ち） */
  status?: string
  action?: { label: string; onClick: () => void; busy?: boolean }
}

/** 文章だけの画面（招待リンクなし・承認待ち・承認済み・エラーなど） */
export function Notice({ title, children, status, action }: Props) {
  return (
    <>
      {status && (
        <p>
          <span className="status status-wait">{status}</span>
        </p>
      )}
      <h1>{title}</h1>
      <div className="lead">{children}</div>
      {action && (
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={action.onClick} disabled={action.busy}>
            {action.busy ? '確認中…' : action.label}
          </button>
        </div>
      )}
    </>
  )
}
