// LINE ログイン → Supabase セッション。依存を引数で受け取るので、Deno なしでもテストできる。

export type SessionOut = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
};

export type Deps = {
  /** LINE ミニアプリのチャネル ID（Developing / Review / Published で別々。どれかに一致すればよい） */
  channelIds: string[];
  /** ブラウザから呼べるオリジン */
  allowedOrigins: string[];
  /** LINE の ID トークンを検証し、成功すれば sub（LINE のユーザー ID）を返す */
  verifyIdToken(idToken: string, channelId: string): Promise<{ sub: string } | null>;
  /** 認証ユーザーを（なければ作って）用意し、ログイン用のハッシュを発行する */
  ensureUser(email: string): Promise<{ userId: string; hashedToken: string }>;
  /** users と line_accounts の行を（なければ）作る。既存の行は書き換えない */
  ensureProfile(userId: string, lineUserId: string): Promise<void>;
  /** ハッシュからセッションを作る */
  createSession(hashedToken: string): Promise<SessionOut>;
  log(message: string, detail?: unknown): void;
};

const LINE_SUB = /^U[0-9a-f]{32}$/;

export function emailForLineUser(sub: string): string {
  // 実在しないドメイン（.invalid）。メールは一切送らない。LINE の ID から一意に決まる。
  return `line-${sub.toLowerCase()}@line.nobit.invalid`;
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin, deps.allowedOrigins);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (origin && !deps.allowedOrigins.includes(origin)) return json({ error: "origin_not_allowed" }, 403, cors);
  if (deps.channelIds.length === 0) {
    deps.log("LINE_CHANNEL_IDS is not set");
    return json({ error: "server_misconfigured" }, 500, cors);
  }

  let idToken: unknown;
  try {
    idToken = (await req.json())?.idToken;
  } catch {
    return json({ error: "bad_request" }, 400, cors);
  }
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 4096) {
    return json({ error: "bad_request" }, 400, cors);
  }

  try {
    let sub: string | null = null;
    for (const channelId of deps.channelIds) {
      const verified = await deps.verifyIdToken(idToken, channelId);
      if (verified) {
        sub = verified.sub;
        break;
      }
    }
    if (!sub || !LINE_SUB.test(sub)) return json({ error: "invalid_id_token" }, 401, cors);

    const { userId, hashedToken } = await deps.ensureUser(emailForLineUser(sub));
    await deps.ensureProfile(userId, sub);
    const session = await deps.createSession(hashedToken);
    return json({ session }, 200, cors);
  } catch (e) {
    deps.log("line-login failed", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 500, cors);
  }
}
