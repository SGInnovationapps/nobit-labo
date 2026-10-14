import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './lib/ErrorBoundary'
import { installErrorReporting } from './lib/errorReporting'
import './styles.css'

// 管理画面は /admin。生徒のミニアプリには読み込まない
const AdminApp = lazy(() => import('./admin/AdminApp'))
const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/')

// 画面のエラーを運営に送る（LINE ログインより前のエラーも拾うため、最初に入れる）
installErrorReporting(isAdmin ? 'admin' : 'student')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isAdmin ? (
        <Suspense fallback={null}>
          <AdminApp />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
