// 公式LINE から再開の声かけを送る（運営だけ）。依存を引数で受け取るので、Deno なしでもテストできる。
//
// action "quota"：LINE の今月の上限と使った通数、NOBIT! から送った通数を返す
// action "send" ：[{ alertIds, text }]（1人1件、最大50件）を、LINE の残り通数を確かめてから1件ずつ送る
//   予約（reserve）で送れない理由を DB が判定し、送った結果（finish）を DB に記録する。届いたアラートは連絡済みになる。
//   LINE には予約ごとの再送キー（X-Line-Retry-Key）を渡すので、通信が切れて送り直しても二重には届かない。

export type Quota = { limit: number | null; used: number };
export type Item = { alertIds: string[]; text: string };
export type Reserved =
  | { ok: true; pushId: string; lineUserId: string; text: string; retryKey: string }
  | { ok: false; reason: string };
export type PushResult = { status: number; requestId: string | null };
export type LineMessage = Record<string, unknown>;

export type Deps = {
  allowedOrigins: string[];
  /** Authorization ヘッダのトークンから、呼び出した人を返す。確認できなければ null */
  authenticate(token: string): Promise<{ userId: string; role: string | null } | null>;
  /** LINE の今月の上限（上限なしは null）と、使った通数 */
  quota(): Promise<Quota>;
  /** NOBIT! から今月（JST）送った通数 */
  sentThisMonth(): Promise<number>;
  reserve(operatorId: string, items: Item[]): Promise<Reserved[]>;
  push(to: string, messages: LineMessage[], retryKey: string): Promise<PushResult>;
  finish(pushId: string, ok: boolean, requestId: string | null, error: string | null): Promise<void>;
  /** ミニアプリの URL（あればボタンを付ける） */
  appUrl: string | null;
  log(message: string, detail?: unknown): void;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ITEMS = 50;
export const MAX_TEXT = 500;
/** ボタンつきメッセージの本文の上限（タイトル・画像なし） */
const BUTTONS_TEXT_MAX = 160;
export const OPEN_LABEL = "NOBIT! をひらく";

/** 画面から来た送る内容を確かめる。おかしければ null */
export function parseItems(v: unknown): Item[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_ITEMS) return null;
  const out: Item[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const ids = r.alertIds;
    const text = typeof r.text === "string" ? r.text.trim() : "";
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20 || !ids.every((x) => typeof x === "string" && UUID.test(x))) return null;
    if ([...text].length < 1 || [...text].length > MAX_TEXT) return null;
    out.push({ alertIds: ids as string[], text });
  }
  return out;
}

/** 送るメッセージ。アプリの URL があれば「NOBIT! をひらく」ボタンを付ける（本文が長いときは、URL を本文の下に足す） */
export function buildMessages(text: string, appUrl: string | null): LineMessage[] {
  if (!appUrl) return [{ type: "text", text }];
  if ([...text].length <= BUTTONS_TEXT_MAX) {
    return [{
      type: "template",
      altText: [...text].slice(0, 400).join(""),
      template: { type: "buttons", text, actions: [{ type: "uri", label: OPEN_LABEL, uri: appUrl }] },
    }];
  }
  return [{ type: "text", text: `${text}\n\n${OPEN_LABEL}\n${appUrl}` }];
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

export type SendResult = { alertIds: string[]; ok: boolean; reason?: string };

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

  if (body.action === "quota") {
    try {
      const [q, sent] = await Promise.all([deps.quota(), deps.sentThisMonth()]);
      return json({ limit: q.limit, used: q.used, remaining: q.limit === null ? null : Math.max(0, q.limit - q.used), sentByNobit: sent }, 200);
    } catch (e) {
      deps.log("quota failed", String(e));
      return json({ error: "line_unavailable" }, 502);
    }
  }

  if (body.action !== "send") return json({ error: "bad_request" }, 400);
  const items = parseItems(body.items);
  if (!items) return json({ error: "bad_request" }, 400);

  // 送る前に、LINE の残り通数を確かめる（足りなければ1通も送らない）
  let q: Quota;
  try { q = await deps.quota(); } catch (e) {
    deps.log("quota failed", String(e));
    return json({ error: "line_unavailable" }, 502);
  }
  if (q.limit !== null && q.used + items.length > q.limit) {
    return json({ error: "quota", remaining: Math.max(0, q.limit - q.used) }, 409);
  }

  let reserved: Reserved[];
  try { reserved = await deps.reserve(me.userId, items); } catch (e) {
    deps.log("reserve failed", String(e));
    return json({ error: "server_error" }, 500);
  }

  const results: SendResult[] = [];
  let quotaReached = false;
  for (let i = 0; i < items.length; i++) {
    const r = reserved[i];
    const alertIds = items[i].alertIds;
    if (!r || !r.ok) { results.push({ alertIds, ok: false, reason: r && !r.ok ? r.reason : "invalid" }); continue; }
    if (quotaReached) {
      await deps.finish(r.pushId, false, null, "quota");
      results.push({ alertIds, ok: false, reason: "quota" });
      continue;
    }
    let p: PushResult;
    try {
      p = await deps.push(r.lineUserId, buildMessages(r.text, deps.appUrl), r.retryKey);
    } catch (e) {
      deps.log("push failed", String(e));
      await deps.finish(r.pushId, false, null, "network");
      results.push({ alertIds, ok: false, reason: "line_error" });
      continue;
    }
    // 409 は、同じ再送キーで受け付け済み（前の送信が届いている）
    if (p.status === 200 || p.status === 409) {
      await deps.finish(r.pushId, true, p.requestId, null);
      results.push({ alertIds, ok: true });
    } else if (p.status === 429) {
      quotaReached = true;
      await deps.finish(r.pushId, false, p.requestId, "quota");
      results.push({ alertIds, ok: false, reason: "quota" });
    } else {
      deps.log("push rejected", { status: p.status, requestId: p.requestId });
      await deps.finish(r.pushId, false, p.requestId, `http_${p.status}`);
      results.push({ alertIds, ok: false, reason: "line_error" });
    }
  }
  return json({ results, sent: results.filter((x) => x.ok).length }, 200);
}
