// 実行：node --experimental-strip-types handler.test.ts   （Deno なしで動く）
import assert from "node:assert/strict";
import { type Deps, emailForLineUser, handle } from "./handler.ts";

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
console.log("ok");
