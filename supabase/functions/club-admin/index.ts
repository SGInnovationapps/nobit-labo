// クラブ管理者の追加・解除・一覧（Edge Function。運営だけが呼べる）
//
// 必要なシークレット：ALLOWED_ORIGINS（呼び出しを許すオリジン。line-login と同じ値）
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で渡す。
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Admin, type Deps, handle } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

async function roleOf(userId: string): Promise<string | null> {
  const { data, error } = await db.from("users").select("role").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

const deps: Deps = {
  allowedOrigins: list(Deno.env.get("ALLOWED_ORIGINS")),

  async authenticate(token) {
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    return { userId: data.user.id, role: await roleOf(data.user.id) };
  },

  async ensureUser(email) {
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && created.error.code !== "email_exists") throw created.error;
    // 既存でも新規でも、リンクの発行（メールは送らない）でユーザー ID が取れる
    const link = await db.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    const userId = link.data.user.id;
    return { userId, role: await roleOf(userId) };
  },

  async upsertAdmin(userId, displayName) {
    const { data } = await db.from("users").select("id").eq("id", userId).maybeSingle();
    const { error } = data
      ? await db.from("users").update({ role: "club_admin", ...(displayName ? { display_name: displayName } : {}) }).eq("id", userId)
      : await db.from("users").insert({ id: userId, role: "club_admin", display_name: displayName });
    if (error) throw error;
  },

  async liveClub(userId) {
    const { data, error } = await db.from("club_members").select("club_id").eq("user_id", userId).in("status", ["pending", "approved"]).maybeSingle();
    if (error) throw error;
    return data?.club_id ?? null;
  },

  async addMember(clubId, userId, operatorId) {
    const { error } = await db.from("club_members").insert({
      club_id: clubId, user_id: userId, member_role: "club_admin", status: "approved", reviewed_by: operatorId, reviewed_at: new Date().toISOString(),
    });
    if (error) throw error;
  },

  async leaveMember(clubId, userId) {
    const { data, error } = await db.from("club_members").update({ status: "left" })
      .eq("club_id", clubId).eq("user_id", userId).eq("member_role", "club_admin").eq("status", "approved").select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  },

  async listAdmins(clubId): Promise<Admin[]> {
    const { data, error } = await db.from("club_members").select("user_id, users(display_name)")
      .eq("club_id", clubId).eq("member_role", "club_admin").eq("status", "approved").order("created_at");
    if (error) throw error;
    const out: Admin[] = [];
    for (const r of data ?? []) {
      const u = await db.auth.admin.getUserById(r.user_id);
      const rel = Array.isArray(r.users) ? r.users[0] : r.users;
      out.push({ userId: r.user_id, email: u.data.user?.email ?? "", displayName: rel?.display_name ?? null });
    }
    return out;
  },

  log: (m, d) => console.log(m, d ?? ""),
};

Deno.serve((req) => handle(req, deps));
