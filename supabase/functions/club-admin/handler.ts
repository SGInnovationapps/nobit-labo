// クラブ管理者の追加・解除・一覧（運営だけ）。依存を引数で受け取るので、Deno なしでもテストできる。
//
// 管理画面はメールリンク認証で「新しいユーザーを作らない」設定のため、追加の時点で認証ユーザーを用意する。
// ロールの変更は service_role だけが行える（DB の決まり）ので、画面からは直接できず、この関数を通す。

export type Admin = { userId: string; email: string; displayName: string | null };

export type Deps = {
  allowedOrigins: string[];
  /** Authorization ヘッダのトークンから、呼び出した人を返す。確認できなければ null */
  authenticate(token: string): Promise<{ userId: string; role: string | null } | null>;
  /** 認証ユーザーを（なければ作って）用意し、その ID と、すでにある利用者のロールを返す */
  ensureUser(email: string): Promise<{ userId: string; role: string | null }>;
  /** 利用者の行を作り、ロールを club_admin にする（表示名は任意） */
  upsertAdmin(userId: string, displayName: string | null): Promise<void>;
  /** いま属しているクラブ（承認待ち・承認済み）。なければ null */
  liveClub(userId: string): Promise<string | null>;
  addMember(clubId: string, userId: string, operatorId: string): Promise<void>;
  leaveMember(clubId: string, userId: string): Promise<boolean>;
  listAdmins(clubId: string): Promise<Admin[]>;
  log(message: string, detail?: unknown): void;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const c = cors(origin, deps.allowedOrigins);
  const json = (b: unknown, s: number) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...c, "Content-Type": "application/json", "Cache-Control": "no-store" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (origin && !deps.allowedOrigins.includes(origin)) return json({ error: "origin_not_allowed" }, 403);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const me = token ? await deps.authenticate(token) : null;
  if (!me) return json({ error: "unauthorized" }, 401);
  if (me.role !== "operator") return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const clubId = typeof body.clubId === "string" && UUID.test(body.clubId) ? body.clubId : null;
  if (!clubId) return json({ error: "bad_request" }, 400);

  try {
    switch (body.action) {
      case "list":
        return json({ admins: await deps.listAdmins(clubId) }, 200);

      case "add": {
        const email = normalizeEmail(body.email);
        if (!email) return json({ error: "invalid_email" }, 400);
        const name = typeof body.displayName === "string" ? body.displayName.trim() : "";
        if ([...name].length > 20) return json({ error: "invalid_name" }, 400);

        const user = await deps.ensureUser(email);
        // 生徒や運営のアドレスを、クラブ管理者に書き換えない
        if (user.role !== null && user.role !== "club_admin") return json({ error: "not_allowed" }, 409);
        const live = await deps.liveClub(user.userId);
        if (live === clubId) return json({ error: "already_admin" }, 409);
        if (live !== null) return json({ error: "other_club" }, 409);

        await deps.upsertAdmin(user.userId, name || null);
        await deps.addMember(clubId, user.userId, me.userId);
        return json({ admins: await deps.listAdmins(clubId) }, 200);
      }

      case "remove": {
        const userId = typeof body.userId === "string" && UUID.test(body.userId) ? body.userId : null;
        if (!userId) return json({ error: "bad_request" }, 400);
        if (!(await deps.leaveMember(clubId, userId))) return json({ error: "not_found" }, 404);
        return json({ admins: await deps.listAdmins(clubId) }, 200);
      }

      default:
        return json({ error: "bad_request" }, 400);
    }
  } catch (e) {
    deps.log("club_admin_failed", { error: String(e) });
    return json({ error: "server_error" }, 500);
  }
}
