// 実行：node --experimental-strip-types handler.test.ts   （Deno なしで動く）
import assert from "node:assert/strict";
import { type Deps, emailForLineUser, handle, peekToken } from "./handler.ts";

const SUB = "U" + "0123456789abcdef".repeat(2);
const TOKEN = "x".repeat(40);
const calls: string[] = [];
const base = (over: Partial<Deps> = {}): Deps => ({
  channelIds: ["111", "222"],
  allowedOrigins: ["https://nobit-labo.gymspiral.workers.dev"],
  verifyIdToken: async (_t, ch) => (ch === "222" ? { sub: SUB } : null),
  ensureUser: async (email) => { calls.push("user:" + email); return { userId: "uid-1", hashedToken: "h" }; },
  ensureProfile: async (id, sub) => { calls.push(`profile:${id}:${sub}`); },
  createSession: async () => ({ access_token: "a", refresh_token: "r", expires_in: 3600, token_type: "bearer" }),
  log: () => {},
  ...over,
});
const req = (body: unknown, init: RequestInit = {}) =>
  new Request("https://f.test/line-login", { method: "POST", body: JSON.stringify(body), ...init });
const ORIGIN = { Origin: "https://nobit-labo.gymspiral.workers.dev" };

// 正常：2 つ目のチャネルで検証が通る
let r = await handle(req({ idToken: TOKEN }, { headers: ORIGIN }), base());
assert.equal(r.status, 200);
assert.equal((await r.json()).session.access_token, "a");
assert.equal(r.headers.get("Access-Control-Allow-Origin"), ORIGIN.Origin);
assert.deepEqual(calls, [`user:line-${SUB.toLowerCase()}@line.nobit.invalid`, `profile:uid-1:${SUB}`]);

// どのチャネルでも検証が通らない
r = await handle(req({ idToken: TOKEN }), base({ verifyIdToken: async () => null }));
assert.equal(r.status, 401);

// sub の形が不正なら通さない
r = await handle(req({ idToken: TOKEN }), base({ verifyIdToken: async () => ({ sub: "evil@example.com" }) }));
assert.equal(r.status, 401);

// 不正なリクエスト
assert.equal((await handle(req({}), base())).status, 400);
assert.equal((await handle(req({ idToken: 123 }), base())).status, 400);
assert.equal((await handle(new Request("https://f.test", { method: "POST", body: "not json" }), base())).status, 400);
assert.equal((await handle(new Request("https://f.test", { method: "GET" }), base())).status, 405);

// 許可していないオリジン
r = await handle(req({ idToken: TOKEN }, { headers: { Origin: "https://evil.example" } }), base());
assert.equal(r.status, 403);
assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);

// プリフライト
r = await handle(new Request("https://f.test", { method: "OPTIONS", headers: ORIGIN }), base());
assert.equal(r.status, 204);
assert.match(r.headers.get("Access-Control-Allow-Headers")!, /apikey/);

// 設定漏れ・内部エラー（詳細は返さない）
assert.equal((await handle(req({ idToken: TOKEN }), base({ channelIds: [] }))).status, 500);
r = await handle(req({ idToken: TOKEN }), base({ ensureUser: async () => { throw new Error("secret detail"); } }));
assert.equal(r.status, 500);
assert.deepEqual(await r.json(), { error: "server_error" });

assert.equal(emailForLineUser("UABC"), "line-uabc@line.nobit.invalid");

// ---- 拒否の理由をログに残す（設定の取り違えを見つけるため）----

// ID トークンの中身（aud = 発行元のチャネルID、exp = 期限）を、署名を確かめずに覗ける
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeToken = (payload: unknown) => `${b64url({ alg: "HS256" })}.${b64url(payload)}.sig`;
assert.deepEqual(peekToken(fakeToken({ aud: "2001234567", exp: 1700000000, sub: SUB })), { aud: "2001234567", exp: 1700000000 });
assert.deepEqual(peekToken("not a jwt"), {});
assert.deepEqual(peekToken(""), {});
assert.deepEqual(peekToken("a.!!!notbase64!!!.c"), {});

// 401 のとき、トークンのチャネルIDと、設定しているチャネルIDを残す
let logged: { message: string; detail?: unknown }[] = [];
const collect = (message: string, detail?: unknown) => { logged.push({ message, detail }); };
r = await handle(
  req({ idToken: fakeToken({ aud: "999", exp: Math.floor(Date.now() / 1000) + 600 }) }),
  base({ verifyIdToken: async () => null, log: collect }),
);
assert.equal(r.status, 401);
assert.equal(logged.length, 1);
assert.equal(logged[0].message, "invalid_id_token");
assert.deepEqual(logged[0].detail, {
  トークンのチャネルID: "999",
  設定しているチャネルID: ["111", "222"],
  期限切れ: false,
  "検証後のsubの形": "(検証が通らず)",
});

// 期限切れのトークンは、そうと分かる
logged = [];
r = await handle(
  req({ idToken: fakeToken({ aud: "111", exp: 1700000000 }) }),
  base({ verifyIdToken: async () => null, log: collect }),
);
assert.equal(r.status, 401);
assert.equal((logged[0].detail as { 期限切れ: boolean }).期限切れ, true);

// 403 のとき、呼び出し元と許可しているオリジンを残す
logged = [];
r = await handle(req({ idToken: TOKEN }, { headers: { Origin: "https://evil.example" } }), base({ log: collect }));
assert.equal(r.status, 403);
assert.deepEqual(logged, [{
  message: "origin_not_allowed",
  detail: { 呼び出し元: "https://evil.example", 許可しているオリジン: ["https://nobit-labo.gymspiral.workers.dev"] },
}]);

// ログを出しても、画面に返す中身は変えない
assert.deepEqual(await r.json(), { error: "origin_not_allowed" });

console.log("ok");
