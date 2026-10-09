import type { ReactNode } from 'react'

const STEP_LABELS = ['保護者同意', '表示名と学年', '承認待ち'] as const

type Props = {
  /** 1〜3。出さないときは null */
  progress: number | null
  children: ReactNode
}

export function Shell({ progress, children }: Props) {
  return (
    <div className="shell">
      <header>
        <div className="brand">NOBIT!</div>
        {progress !== null && (
          <div className="progress">
            <div className="progress-bars" aria-hidden="true">
              {STEP_LABELS.map((label, i) => (
                <span key={label} className={i < progress ? 'on' : ''} />
              ))}
            </div>
            <p className="progress-label">
              <span className="num">{progress}</span> / <span className="num">3</span>　{STEP_LABELS[progress - 1]}
            </p>
          </div>
        )}
      </header>
      <main className="screen">{children}</main>
    </div>
  )
}
