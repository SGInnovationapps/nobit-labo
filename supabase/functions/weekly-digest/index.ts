// 週1回のメール「今週の記録」（Edge Function）。毎週月曜の朝に cron から POST する。
//
// 必要なシークレット（supabase secrets set）：
//   DIGEST_SECRET   cron から送る合言葉（x-cron-secret ヘッダ）
//   RESEND_API_KEY  Resend の API キー（メール送信サービス。ほかのサービスに替えるなら send を書き換える）
//   MAIL_FROM       送信元。例：NOBIT! <notice@あなたのドメイン>（Resend で認証済みのドメイン）
//   ADMIN_URL       管理画面のURL
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で渡す。
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Deps, handle } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const deps: Deps = {
  secret: Deno.env.get("DIGEST_SECRET") ?? "",
  adminUrl: Deno.env.get("ADMIN_URL") ?? "",

  async fetchDigests(today) {
    const { data, error } = await db.rpc("weekly_digest_data", today ? { p_today: today } : {});
    if (error) throw error;
    return data ?? [];
  },

  async send({ to, subject, text }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("MAIL_FROM"), to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}`);
  },

  async markSent(club, weekStart, recipients) {
    const { error } = await db.rpc("weekly_digest_mark", { p_club: club, p_week_start: weekStart, p_recipients: recipients });
    if (error) throw error;
  },

  log: (m, d) => console.log(m, d ?? ""),
};

Deno.serve((req) => handle(req, deps));
