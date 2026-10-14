// 画面のエラーを送る形に整える（送る処理は errorReporting.ts）。
// ここは import を持たない純粋な関数だけにして、node のテストから読めるようにする。

export type ErrorApp = 'student' | 'admin'
/** error：拾えなかった例外／rejection：拾えなかった Promise の失敗／render：画面の描画の失敗／handled：画面側で拾って console.error に出したもの */
export type ErrorKind = 'error' | 'rejection' | 'render' | 'handled'

export type ErrorReport = {
  app: ErrorApp
  kind: ErrorKind
  message: string
  stack: string | null
  path: string | null
  device: string | null
  appVersion: string | null
}

const LIMITS = { message: 500, stack: 2000, path: 200, device: 80, appVersion: 40 } as const

/** 長い英数字（JWT・アクセストークン・招待コードなど）とメールアドレスを伏せる。DB 側でも同じことをする */
export function redact(text: string): string {
  return text
    .replace(/[A-Za-z0-9_-]{24,}(\.[A-Za-z0-9_-]{8,}){0,2}/g, '[…]')
    .replace(/[^\s@<>()"']+@[^\s@<>()"']+\.[A-Za-z]{2,}/g, '[mail]')
}

function clip(text: string | null | undefined, max: number): string | null {
  if (text == null) return null
  const t = redact(text).trim()
  return t === '' ? null : t.slice(0, max)
}

/** URL からパスだけを取り出す（LIFF は ? と # にトークンを載せるため、そこは送らない） */
export function pathOf(href: string): string | null {
  try {
    const p = new URL(href).pathname
    return p.slice(0, LIMITS.path) || '/'
  } catch {
    return null
  }
}

/** 端末の種類だけを短く（例：iOS 18.1 · LINE 15.2.0）。User-Agent をそのままは送らない */
export function deviceOf(ua: string): string | null {
  const parts: string[] = []
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/.exec(ua)
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua)
  if (ios) parts.push(`iOS ${ios[1]}.${ios[2]}`)
  else if (android) parts.push(`Android ${android[1]}`)
  else if (/Windows/.test(ua)) parts.push('Windows')
  else if (/Macintosh|Mac OS X/.test(ua)) parts.push('Mac')
  const line = /\bLine\/(\d+(?:\.\d+){0,2})/i.exec(ua)
  if (line) parts.push(`LINE ${line[1]}`)
  else if (/\bChrome\//.test(ua) && !/Edg\//.test(ua)) parts.push('Chrome')
  else if (/\bSafari\//.test(ua)) parts.push('Safari')
  return parts.length ? parts.join(' · ').slice(0, LIMITS.device) : null
}

/** 投げられた値から、送る文面とスタックを取り出す。Error でも、Supabase のエラー（message を持つ物）でもないものは null */
export function describe(value: unknown): { message: string; stack: string | null } | null {
  if (value instanceof Error) {
    const name = value.name && value.name !== 'Error' ? `${value.name}: ` : ''
    return { message: `${name}${value.message || '(no message)'}`, stack: value.stack ?? null }
  }
  if (value && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string') {
    const v = value as { message: string; code?: unknown; status?: unknown }
    const code = typeof v.code === 'string' || typeof v.code === 'number' ? `[${v.code}] ` : typeof v.status === 'number' ? `[${v.status}] ` : ''
    return { message: `${code}${v.message}`, stack: null }
  }
  return null
}

/** 送らないもの：他のサイトのスクリプトの中身の見えないエラー、拡張機能、画面を閉じたときの通信の打ち切り */
export function isNoise(message: string, stack: string | null): boolean {
  if (/^Script error\.?$/.test(message)) return true
  if (stack && /(chrome|moz|safari)-extension:\/\//.test(stack)) return true
  if (/AbortError|The user aborted a request|signal is aborted/i.test(message)) return true
  return false
}

export function makeReport(
  app: ErrorApp, kind: ErrorKind, value: unknown, env: { href: string; userAgent: string; appVersion: string | null },
): ErrorReport | null {
  const d = describe(value)
  if (!d) return null
  const message = clip(d.message, LIMITS.message)
  if (!message || isNoise(message, d.stack)) return null
  return {
    app,
    kind,
    message,
    stack: clip(d.stack, LIMITS.stack),
    path: pathOf(env.href),
    device: deviceOf(env.userAgent),
    appVersion: clip(env.appVersion, LIMITS.appVersion),
  }
}

/** 1回の起動で送る数を絞る：同じ文面のエラーは1回、全体で max 件まで */
export class ReportGate {
  private readonly seen = new Set<string>()
  private sent = 0
  private readonly max: number
  constructor(max = 20) {
    this.max = max
  }

  allow(r: ErrorReport): boolean {
    // 種類は見ない（同じ失敗が「描画」と「画面で案内」の両方で届くことがあるため）
    const key = `${r.message}|${r.path ?? ''}`
    if (this.seen.has(key) || this.sent >= this.max) return false
    this.seen.add(key)
    this.sent += 1
    return true
  }
}
