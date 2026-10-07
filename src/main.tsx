import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import liff from '@line/liff'

liff.init({ liffId: import.meta.env.VITE_LIFF_ID })
  .then(() => alert(liff.isInClient() ? 'LIFF OK（LINE内）' : 'LIFF OK（ブラウザ）'))
  .catch((e) => alert('LIFF NG: ' + e.message))


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
