// 環境変数と、フェーズごとの表示の切り替え
const env = import.meta.env;

/** 公開するフェーズ。2 にすると コイン・休息チケット・大会日の登録 などが画面に出る */
export const PHASE = Number(env.VITE_PHASE ?? "1");
export const atLeast = (phase: number) => PHASE >= phase;

/** 見本データで動かす（LINE と Supabase なしで画面を確かめる）。?demo=1 でも有効 */
export const DEMO =
  env.VITE_DEMO === "1" || new URLSearchParams(window.location.search).get("demo") === "1";

export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? "";
export const LIFF_ID = env.VITE_LIFF_ID ?? "";
/** 公式LINE のベーシックID（@から始まる）。友だち追加のリンクに使う */
export const LINE_OA_BASIC_ID = env.VITE_LINE_OA_BASIC_ID ?? "";
/** 招待QRに入れるミニアプリの URL。未設定なら LIFF の URL を使う */
export const MINIAPP_URL = env.VITE_MINIAPP_URL || `https://miniapp.line.me/${LIFF_ID}`;

export const inviteUrl = (code: string) => `${MINIAPP_URL}?club=${encodeURIComponent(code)}`;
export const addFriendUrl = () =>
  LINE_OA_BASIC_ID ? `https://line.me/R/ti/p/${encodeURIComponent(LINE_OA_BASIC_ID)}` : "";
