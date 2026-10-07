// LINE ログイン → Supabase セッション（Edge Function）
//
// 流れ：ミニアプリが liff.getIDToken() を送る → LINE に検証 → LINE のユーザー ID から
// 認証ユーザーを用意（なければ作る）→ ログイン用ハッシュを発行 → セッションにして返す。
//
// 必要なシークレット（supabase secrets set、またはダッシュボードの Edge Functions > Secrets）：
//   LINE_CHANNEL_IDS  ミニアプリのチャネル ID。Developing / Review / Published を使うならカンマ区切りで全部
//   ALLOWED_ORIGINS   呼び出しを許すオリジン。カンマ区切り
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で渡す。
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Deps, handle } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, clientOptions);

const deps: Deps = {
  channelIds: list(Deno.env.get("LINE_CHANNEL_IDS")),
  allowedOrigins: list(Deno.env.get("ALLOWED_ORIGINS")),

  async verifyIdToken(idToken, channelId) {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.sub === "string" ? { sub: body.sub } : null;
  },

  async ensureUser(email) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    // 2 回目以降のログインは「すでにある」で正常
    if (created.error && created.error.code !== "email_exists") throw created.error;

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    return { userId: link.data.user.id, hashedToken: link.data.properties.hashed_token };
  },

  async ensureProfile(userId, lineUserId) {
    // ignoreDuplicates：既にある行（運営・クラブ管理者のロールなど）は書き換えない
    const u = await admin.from("users").upsert({ id: userId, role: "student" }, { onConflict: "id", ignoreDuplicates: true });
    if (u.error) throw u.error;
    const l = await admin.from("line_accounts").upsert(
      { user_id: userId, line_user_id: lineUserId },
      { onConflict: "line_user_id", ignoreDuplicates: true },
    );
    if (l.error) throw l.error;
  },

  async createSession(hashedToken) {
    // 使い捨てのクライアント（セッションを持ち越さない）
    const tmp = createClient(url, serviceKey, clientOptions);
    const { data, error } = await tmp.auth.verifyOtp({ token_hash: hashedToken, type: "magiclink" });
    if (error || !data.session) throw error ?? new Error("no session");
    const s = data.session;
    return {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: s.expires_in,
      expires_at: s.expires_at,
      token_type: s.token_type,
    };
  },

  log: (message, detail) => console.error(message, detail ?? ""),
};

Deno.serve((req) => handle(req, deps));
