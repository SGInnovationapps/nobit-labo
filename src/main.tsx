import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { signInWithLine } from './lib/lineLogin'

signInWithLine()
  .then((r) => alert('結果: ' + r))
  .catch(async (e) => {
    let detail = e?.message ?? String(e)
    try { detail += ' / ' + JSON.stringify(await e.context?.json()) } catch {}
    alert('ログイン失敗: ' + detail)
  })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
