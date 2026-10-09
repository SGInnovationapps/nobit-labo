import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// 管理画面は /admin。生徒のミニアプリには読み込まない
const AdminApp = lazy(() => import('./admin/AdminApp'))
const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
