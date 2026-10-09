// 招待コードの受け取りと、ログインのやり直し（リダイレクト）をまたいだ保存

const KEY = 'nobit.invite'
const CODE = /^[a-z0-9]{8,32}$/

export function normalizeInvite(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase()
  return CODE.test(v) ? v : null
}

/**
 * URL から招待コードを取り出す。次の 2 つの形に対応する。
 *   ?invite=CODE
 *   ?liff.state=%3Finvite%3DCODE   （LIFF が招待付きの URL を受けたときの形）
 */
export function parseInvite(search: string): string | null {
  const params = new URLSearchParams(search)
  const direct = normalizeInvite(params.get('invite'))
  if (direct) return direct

  const state = params.get('liff.state')
  if (state) {
    const i = state.indexOf('?')
    if (i >= 0) return normalizeInvite(new URLSearchParams(state.slice(i)).get('invite'))
  }
  return null
}

export function rememberInvite(code: string): void {
  try {
    localStorage.setItem(KEY, code)
  } catch {
    // 保存できない環境では、URL にあるときだけ使える
  }
}

export function forgetInvite(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 何もしない
  }
}

/** URL を優先し、なければ保存してあるものを返す */
export function readInvite(search: string = globalThis.location?.search ?? ''): string | null {
  const fromUrl = parseInvite(search)
  if (fromUrl) return fromUrl
  try {
    return normalizeInvite(localStorage.getItem(KEY))
  } catch {
    return null
  }
}
