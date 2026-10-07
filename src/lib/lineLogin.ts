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
