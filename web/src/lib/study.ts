// 勉強タイマーの補助：アプリを閉じたときの記録と、画面を消さない設定
import { DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { supabase } from "./supabase";

let accessToken: string | null = null;
if (!DEMO) {
  supabase.auth.getSession().then(({ data }) => (accessToken = data.session?.access_token ?? null));
  supabase.auth.onAuthStateChange((_e, s) => (accessToken = s?.access_token ?? null));
}

/**
 * アプリを閉じるとき（pagehide）に、その時刻でタイマーを止める。
 * 画面が閉じても届くよう keepalive で送る。届かなかった場合は、サーバーが
 * 「画面が開いていない時間」から閉じたとみなして止める（study_idle_minutes）。
 */
export function endStudyOnClose(sessionId: string) {
  if (DEMO || !accessToken) return;
  try {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/end_study`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ p_session_id: sessionId, p_reason: "app_closed" }),
    }).catch(() => undefined);
  } catch {
    // 送れなくても、サーバー側の判定で止まる
  }
}

/** 対応する端末では、タイマーの間は画面を消さない */
export async function keepScreenOn(): Promise<WakeLockSentinel | null> {
  try {
    if ("wakeLock" in navigator) return await navigator.wakeLock.request("screen");
  } catch {
    // 省電力モードなどで断られることがある
  }
  return null;
}
