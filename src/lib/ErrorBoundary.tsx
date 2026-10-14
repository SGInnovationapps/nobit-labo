import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { reportError } from './errorReporting'

type Props = { children: ReactNode }
type State = { failed: boolean }

/** 画面の描画が失敗したとき、白い画面のままにせず、読み直しを案内する。エラーは運営に送る */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError('render', error, info.componentStack ?? undefined)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="crash" role="alert">
        <h1>画面を表示できませんでした</h1>
        <p className="lead">これまでの記録は消えていません。読み直すと、多くの場合は元に戻ります。</p>
        <p className="muted">何度も同じ画面になるときは、NOBIT! 公式LINE のチャットで教えてください。この不具合は、運営にも自動で送っています。</p>
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={() => location.reload()}>読み直す</button>
        </div>
      </main>
    )
  }
}
