// LINE ログインの ID トークンを確かめ、Supabase のセッションを発行する。
// 生徒ごとに Supabase Auth のユーザーを1人作り、LINE の識別子を app_metadata に入れる
// （画面から書き換えられないので、DB はこれを本人確認に使う）。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, requireEnv } from "../_shared/http.ts";

type FriendStatus = "friend" | "not_friend" | "unknown";

async function verifyIdToken(idToken: string, channelId: string): Promise<{ sub: string; name?: string }> {
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) throw new Error("invalid_id_token");
  const claims = await res.json();
  if (typeof claims.sub !== "string" || !claims.sub.startsWith("U")) throw new Error("invalid_id_token");
  return { sub: claims.sub, name: claims.name };
}

// 公式LINE を友だち追加しているか（ミニアプリのチャネルと公式LINE が同じプロバイダーでつながっている前提）
async function friendship(accessToken: string | undefined): Promise<FriendStatus> {
  if (!accessToken) return "unknown";
  try {
    const res = await fetch("https://api.line.me/friendship/v1/status", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return "unknown";
    const body = await res.json();
    return body.friendFlag ? "friend" : "not_friend";
  } catch {
    return "unknown";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { idToken, accessToken } = await req.json();
    if (typeof idToken !== "string") return json({ error: "id_token_required" }, 400);

    const line = await verifyIdToken(idToken, requireEnv("LINE_LOGIN_CHANNEL_ID"));
    const friend = await friendship(accessToken);

    const url = requireEnv("SUPABASE_URL");
    const admin = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anon = createClient(url, requireEnv("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // LINE の識別子から決まるメール（実在しないドメイン。メールは送らない）
    const email = `${line.sub.toLowerCase()}@line.nobit.invalid`;
    const appMetadata = { line_user_id: line.sub, line_friend: friend };

    const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: appMetadata });
    if (created.error && !/already|registered|exists/i.test(created.error.message)) throw created.error;

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    const authUserId = link.data.user.id;
    const current = link.data.user.app_metadata ?? {};
    if (current.line_user_id !== line.sub || current.line_friend !== friend) {
      const upd = await admin.auth.admin.updateUserById(authUserId, { app_metadata: { ...current, ...appMetadata } });
      if (upd.error) throw upd.error;
    }

    const verified = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
    if (verified.error || !verified.data.session) throw verified.error ?? new Error("session_not_issued");

    // 登録済みの生徒なら友だち状態を記録する（未登録なら登録時に app_metadata から入る）
    if (friend !== "unknown") {
      await admin.from("users").update({ line_friend_status: friend }).eq("line_user_id", line.sub);
    }

    const s = verified.data.session;
    return json({ access_token: s.access_token, refresh_token: s.refresh_token, line_name: line.name ?? "" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("auth-line", message);
    return json({ error: message === "invalid_id_token" ? message : "login_failed" }, message === "invalid_id_token" ? 401 : 500);
  }
});
