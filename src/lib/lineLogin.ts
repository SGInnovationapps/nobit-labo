import liff from '@line/liff'
import { supabase } from './supabase'

export type LineLoginResult = 'redirecting' | 'signed_in'

/**
 * LINE ミニアプリで開いたときのログイン。
 * 毎回 ID トークンを渡して交換する（端末に残っている別の人のセッションを引き継がないため）。
 */
export async function signInWithLine(): Promise<LineLoginResult> {
  await liff.init({ liffId: import.meta.env.VITE_LIFF_ID })

  if (!liff.isLoggedIn()) {
    liff.login()
    return 'redirecting'
  }

  const idToken = liff.getIDToken()
  if (!idToken) throw new Error('LINE の ID トークンを取得できませんでした')

  const { data, error } = await supabase.functions.invoke('line-login', {
    body: { idToken },
  })
  if (error) throw error

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
  if (sessionError) throw sessionError

  return 'signed_in'
}

/** NOBIT! 公式LINE の友だち追加の URL。VITE_LINE_OA_ID（@ から始まるベーシックID）がなければ null */
export function friendAddUrl(): string | null {
  const id = (import.meta.env.VITE_LINE_OA_ID ?? '').trim()
  if (!/^@[0-9a-z._-]{2,40}$/i.test(id)) return null
  return `https://line.me/R/ti/p/${encodeURIComponent(id)}`
}

/**
 * 公式LINE の友だちか。ミニアプリのチャネルに公式LINE がつながっていて、
 * 友だち追加の URL も作れるときだけ確かめる。確かめられなければ null（導入は止めない）
 */
export async function checkLineFriend(): Promise<boolean | null> {
  if (!friendAddUrl()) return null
  try {
    const { friendFlag } = await liff.getFriendship()
    return friendFlag
  } catch (e) {
    console.error(e)
    return null
  }
}

/** 友だち追加の画面を開く（LINE の中で開く。ミニアプリは閉じない） */
export function openFriendAdd(): void {
  const url = friendAddUrl()
  if (!url) return
  liff.openWindow({ url, external: false })
}
