import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QrCode({ url, filename }: { url: string; filename: string }) {
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let cancelled = false
    void QRCode.toString(url, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#1F2B45', light: '#FFFFFF' },
    }).then((s) => {
      if (!cancelled) setSvg(s)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  async function download() {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 1024,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#1F2B45', light: '#FFFFFF' },
    })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    a.click()
  }

  return (
    <div className="adm-qr">
      <div className="adm-qr-image" role="img" aria-label="招待QRコード" dangerouslySetInnerHTML={{ __html: svg }} />
      <button type="button" className="btn btn-secondary" onClick={() => void download()}>
        画像（PNG）で保存する
      </button>
    </div>
  )
}
