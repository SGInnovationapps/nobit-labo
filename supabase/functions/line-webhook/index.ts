// 公式LINE の Webhook を受けて、友だち状態（follow / unfollow）を記録する（Edge Function）
//
// 必要なシークレット：LINE_MESSAGING_CHANNEL_SECRET（公式LINE の Messaging API チャネルのチャネルシークレット）
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で渡す。
// LINE は Supabase のログインを持たないので、反映は --no-verify-jwt。代わりに、署名で LINE からのものか確かめる。
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Deps, handle } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const deps: Deps = {
  channelSecret: Deno.env.get("LINE_MESSAGING_CHANNEL_SECRET") ?? "",
  async apply(lineUserId, status, at) {
    const { error } = await db.rpc("apply_friend_event", { p_line_user_id: lineUserId, p_status: status, p_event_at: at.toISOString() });
    if (error) throw error;
  },
  log: (m, d) => console.log(m, d ?? ""),
};

Deno.serve((req) => handle(req, deps));
