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

/**
 * NOBIT! 公式LINE の友だち追加の URL（予備）。VITE_LINE_OA_ID（@ から始まるベーシックID）がなければ null。
 * ふだんは liff.requestFriendship() を使うので、この値はなくても動く
 */
export function friendAddUrl(): string | null {
  const id = (import.meta.env.VITE_LINE_OA_ID ?? '').trim()
  if (!/^@[0-9a-z._-]{2,40}$/i.test(id)) return null
  return `https://line.me/R/ti/p/${encodeURIComponent(id)}`
}

/**
 * 公式LINE の友だちか。ミニアプリのチャネルの「デフォルトのLINE公式アカウント」に
 * NOBIT! 公式LINE が設定されていれば確かめられる。確かめられなければ null（止めない）。
 * そのときは、理由を「画面のエラー」に残す（設定の漏れに気づけるように）
 */
export async function checkLineFriend(): Promise<boolean | null> {
  try {
    const { friendFlag } = await liff.getFriendship()
    return friendFlag
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    console.error(new Error(`公式LINE の友だちを確かめられません（ミニアプリのチャネルの「デフォルトのLINE公式アカウント」を確認）: ${reason}`))
    return null
  }
}

/**
 * 友だち追加（ブロックしている人にはブロック解除）を促す、LINE の小さな画面を出す。
 * 使えないときは、友だち追加の URL を開く（VITE_LINE_OA_ID があるときだけ）
 */
export async function openFriendAdd(): Promise<void> {
  try {
    await liff.requestFriendship()
    return
  } catch (e) {
    console.error(e)
  }
  const url = friendAddUrl()
  if (url) liff.openWindow({ url, external: false })
}
