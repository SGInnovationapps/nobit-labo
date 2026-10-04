import liff from "@line/liff";
import { DEMO, LIFF_ID, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { supabase } from "./supabase";
import { ApiError } from "./api";

const INVITE_KEY = "nobit.invite";

/** 招待QRの ?club=XXXX を取り出す（ログインで画面が移っても残るように保存する） */
export function readInviteCode(): string | null {
  const q = new URLSearchParams(window.location.search).get("club");
  try {
    if (q) sessionStorage.setItem(INVITE_KEY, q);
    return q ?? sessionStorage.getItem(INVITE_KEY);
  } catch {
    return q;
  }
}

/**
 * LINE ログインして Supabase のセッションを用意する。
 * 同じ LINE アカウントのセッションが残っていれば、それを使う（サインインの回数を抑える）。
 */
export async function signInWithLine(): Promise<{ lineName: string }> {
  if (DEMO) return { lineName: "見本 太郎" };
  await liff.init({ liffId: LIFF_ID });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return new Promise(() => {}); // LINE のログイン画面へ移る
  }
  const decoded = liff.getDecodedIDToken();
  const lineName = decoded?.name ?? "";
  const { data } = await supabase.auth.getSession();
  if (data.session && data.session.user.app_metadata?.line_user_id === decoded?.sub) {
    return { lineName };
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-line`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ idToken: liff.getIDToken(), accessToken: liff.getAccessToken() }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new ApiError(body.error ?? "login_failed");
  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) throw new ApiError("login_failed");
  return { lineName: body.line_name || lineName };
}

/** 公式LINE を友だち追加しているか（分からなければ null） */
export async function isFriend(): Promise<boolean | null> {
  if (DEMO) return false;
  try {
    const r = await liff.getFriendship();
    return r.friendFlag;
  } catch {
    return null;
  }
}
