// NOBIT! 公式LINE（Messaging API）の Webhook。
// 友だち追加・ブロックを記録する（将来 push に切り替えたとき、届く生徒を見分けるため）。
// 当面は自動の送信をしないので、メッセージには応答しない（公式LINE のチャットで運営が返す）。
import { createClient } from "npm:@supabase/supabase-js@2";
import { json, requireEnv } from "../_shared/http.ts";

async function validSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

type LineEvent = { type: string; source?: { type: string; userId?: string } };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.text();
  if (!(await validSignature(body, req.headers.get("x-line-signature"), requireEnv("LINE_MESSAGING_CHANNEL_SECRET")))) {
    return json({ error: "invalid_signature" }, 401);
  }

  const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const events: LineEvent[] = JSON.parse(body).events ?? [];
  for (const ev of events) {
    const userId = ev.source?.type === "user" ? ev.source.userId : undefined;
    if (!userId) continue;
    const status = ev.type === "follow" ? "friend" : ev.type === "unfollow" ? "blocked" : null;
    if (!status) continue;
    const { error } = await admin.from("users").update({ line_friend_status: status }).eq("line_user_id", userId);
    if (error) console.error("line-webhook", error.message);
  }
  // LINE は 200 以外を再送するので、記録に失敗しても 200 を返す（ログで追う）
  return json({ ok: true });
});
