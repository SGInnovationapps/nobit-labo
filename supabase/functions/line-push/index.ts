// 公式LINE から再開の声かけを送る（Edge Function。運営だけが呼べる）
//
// 必要なシークレット：
//   LINE_MESSAGING_CHANNEL_ACCESS_TOKEN（公式LINE の Messaging API チャネルの、チャネルアクセストークン（長期））
//   ALLOWED_ORIGINS（呼び出しを許すオリジン。line-login と同じ値）
//   NOBIT_APP_URL（任意。ミニアプリの URL。あれば「NOBIT! をひらく」ボタンを付ける）
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で渡す。
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Deps, handle, type Reserved } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const token = Deno.env.get("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN") ?? "";
const LINE = "https://api.line.me/v2/bot/message";

async function lineGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${LINE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`line ${path} ${res.status}`);
  return await res.json();
}

/** 今月（JST）の始まり */
function monthStartJst(now = new Date()): string {
  const j = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), 1) - 9 * 3600_000).toISOString();
}

const deps: Deps = {
  allowedOrigins: list(Deno.env.get("ALLOWED_ORIGINS")),
  appUrl: Deno.env.get("NOBIT_APP_URL")?.trim() || null,

  async authenticate(t) {
    const { data, error } = await db.auth.getUser(t);
    if (error || !data.user) return null;
    const u = await db.from("users").select("role").eq("id", data.user.id).maybeSingle();
    if (u.error) throw u.error;
    return { userId: data.user.id, role: u.data?.role ?? null };
  },

  async quota() {
    if (!token) throw new Error("missing LINE_MESSAGING_CHANNEL_ACCESS_TOKEN");
    const [q, c] = await Promise.all([lineGet("quota"), lineGet("quota/consumption")]);
    return { limit: q.type === "limited" ? Number(q.value) : null, used: Number(c.totalUsage ?? 0) };
  },

  async sentThisMonth() {
    const { count, error } = await db.from("line_pushes").select("id", { count: "exact", head: true })
      .eq("status", "sent").gte("created_at", monthStartJst());
    if (error) throw error;
    return count ?? 0;
  },

  async reserve(operatorId, items) {
    const { data, error } = await db.rpc("reserve_alert_pushes", {
      p_operator: operatorId,
      p_items: items.map((i) => ({ alert_ids: i.alertIds, text: i.text })),
    });
    if (error) throw error;
    return (data as Record<string, unknown>[]).map((r): Reserved => r.ok === true
      ? { ok: true, pushId: String(r.push_id), lineUserId: String(r.line_user_id), text: String(r.text), retryKey: String(r.retry_key) }
      : { ok: false, reason: String(r.reason ?? "invalid") });
  },

  async push(to, messages, retryKey) {
    const res = await fetch(`${LINE}/push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Line-Retry-Key": retryKey },
      body: JSON.stringify({ to, messages }),
    });
    await res.body?.cancel();
    return { status: res.status, requestId: res.headers.get("x-line-request-id") ?? res.headers.get("x-line-accepted-request-id") };
  },

  async finish(pushId, ok, requestId, error) {
    const r = await db.rpc("finish_alert_push", { p_push_id: pushId, p_ok: ok, p_request_id: requestId, p_error: error });
    if (r.error) console.error("finish failed", pushId, r.error.message);
  },

  log: (m, d) => console.log(m, d ?? ""),
};

Deno.serve((req) => handle(req, deps));
