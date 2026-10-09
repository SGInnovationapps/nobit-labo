const show = (text: string) => {
  document.body.style.cssText =
    'margin:0;padding:16px;background:#fff;color:#000;font:14px/1.6 sans-serif;word-break:break-all'
  document.body.textContent = text
}

show('起動中…')
window.addEventListener('error', (e) => show('エラー: ' + e.message))
window.addEventListener('unhandledrejection', (e) =>
  show('未処理のエラー: ' + String(e.reason?.message ?? e.reason)),
)

;(async () => {
  try {
    const { signInWithLine } = await import('./lib/lineLogin')
    show('ログイン中…')
    const r = await signInWithLine()
    show('結果: ' + r)
  } catch (e: any) {
    let detail = e?.message ?? String(e)
    try {
      detail += ' / ' + JSON.stringify(await e.context?.json())
    } catch {}
    show('ログイン失敗: ' + detail)
  }
})()
