// 公式LINE の Webhook（follow / unfollow）→ 友だち状態の記録。依存を引数で受け取るので、Deno なしでもテストできる。
//
// LINE は、Webhook の本文を、チャネルシークレットで署名して X-Line-Signature に付ける（HMAC-SHA256 の Base64）。
// 署名が合わないものは、LINE から来たものではないので受け付けない。

export type FriendStatus = "friend" | "blocked";

export type Deps = {
  /** 公式LINE（Messaging API）チャネルのチャネルシークレット */
  channelSecret: string;
  /** 友だち状態を記録する */
  apply(lineUserId: string, status: FriendStatus, at: Date): Promise<void>;
  log(message: string, detail?: unknown): void;
};

const LINE_SUB = /^U[0-9a-f]{32}$/;

const enc = new TextEncoder();

function toBase64(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

/** 署名の計算（テストからも使う） */
export async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}

/** 時間のかかり方で値が漏れないよう、同じ長さのときは最後まで比べる */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const res = (status: number, body: unknown = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

  if (req.method !== "POST") return res(405, { error: "method_not_allowed" });
  if (!deps.channelSecret) return res(500, { error: "not_configured" });

  const raw = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  if (!signature || !sameString(signature, await sign(deps.channelSecret, raw))) return res(401, { error: "bad_signature" });

  let body: { events?: unknown };
  try { body = JSON.parse(raw); } catch { return res(400, { error: "bad_request" }); }
  const events = Array.isArray(body.events) ? body.events : [];

  let applied = 0;
  for (const e of events as Array<Record<string, unknown>>) {
    const status: FriendStatus | null = e.type === "follow" ? "friend" : e.type === "unfollow" ? "blocked" : null;
    const userId = (e.source as { userId?: unknown } | undefined)?.userId;
    if (!status || typeof userId !== "string" || !LINE_SUB.test(userId)) continue;
    const ts = typeof e.timestamp === "number" && Number.isFinite(e.timestamp) ? new Date(e.timestamp) : new Date();
    try {
      await deps.apply(userId, status, ts);
      applied++;
    } catch (err) {
      // 記録できなかったときは 500 を返し、LINE に再送してもらう（記録は順序に強いので、再送されても安全）
      deps.log("apply_failed", { error: String(err) });
      return res(500, { error: "server_error" });
    }
  }
  return res(200, { applied });
}
