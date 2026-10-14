// 実行：node --experimental-strip-types handler.test.ts
import assert from "node:assert/strict";
import { type Deps, handle, sign } from "./handler.ts";

const SECRET = "test-secret";
const U1 = "U" + "0123456789abcdef".repeat(2);
const got: string[] = [];
const base = (over: Partial<Deps> = {}): Deps => ({
  channelSecret: SECRET,
  apply: async (u, s, at) => { got.push(`${u}:${s}:${at.toISOString()}`); },
  log: () => {},
  ...over,
});
async function post(payload: unknown, opts: { secret?: string; raw?: string; sig?: string | null } = {}) {
  const raw = opts.raw ?? JSON.stringify(payload);
  const sig = opts.sig === undefined ? await sign(opts.secret ?? SECRET, raw) : opts.sig;
  return new Request("https://f.test/line-webhook", { method: "POST", body: raw, headers: sig ? { "x-line-signature": sig } : {} });
}

// 署名：HMAC-SHA256 の Base64（Node 標準の createHmac の結果と一致する）
import { createHmac } from "node:crypto";
assert.equal(await sign("key", "body"), createHmac("sha256", "key").update("body").digest("base64"));

// follow / unfollow
let r = await handle(await post({ events: [
  { type: "follow", timestamp: 1760054400000, source: { type: "user", userId: U1 } },
  { type: "unfollow", timestamp: 1760140800000, source: { type: "user", userId: U1 } },
  { type: "message", source: { type: "user", userId: U1 } },
  { type: "follow", source: { type: "user", userId: "bad" } },
] }), base());
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { applied: 2 });
assert.deepEqual(got, [`${U1}:friend:2025-10-10T00:00:00.000Z`, `${U1}:blocked:2025-10-11T00:00:00.000Z`]);

// LINE の疎通確認（events が空）
r = await handle(await post({ events: [] }), base());
assert.equal(r.status, 200);

// 署名が違う・ない・本文が書き換えられた・シークレット未設定・GET
assert.equal((await handle(await post({ events: [] }, { secret: "other" }), base())).status, 401);
assert.equal((await handle(await post({ events: [] }, { sig: null }), base())).status, 401);
const good = await sign(SECRET, '{"events":[]}');
assert.equal((await handle(await post(null, { raw: '{"events":[{"type":"follow"}]}', sig: good }), base())).status, 401);
assert.equal((await handle(await post({ events: [] }), base({ channelSecret: "" }))).status, 500);
assert.equal((await handle(new Request("https://f.test/", { method: "GET" }), base())).status, 405);

// 署名は合っているが JSON ではない
const junk = "not json";
assert.equal((await handle(await post(null, { raw: junk, sig: await sign(SECRET, junk) }), base())).status, 400);

// 記録に失敗したら 500（LINE に再送してもらう）
r = await handle(await post({ events: [{ type: "follow", timestamp: 1, source: { userId: U1 } }] }), base({ apply: async () => { throw new Error("x"); } }));
assert.equal(r.status, 500);
console.log("line-webhook ok");
