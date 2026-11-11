// 実行：node --experimental-strip-types handler.test.ts
import assert from "node:assert/strict";
import { buildMessages, type Deps, handle, OPEN_LABEL, parseItems, type PushResult, type Reserved } from "./handler.ts";

const A1 = "aaaaaaaa-0000-0000-0000-000000000001";
const A2 = "aaaaaaaa-0000-0000-0000-000000000002";
const A3 = "aaaaaaaa-0000-0000-0000-000000000003";
const ORIGIN = { Origin: "https://nobit.test" };
let calls: string[] = [];

const base = (over: Partial<Deps> = {}): Deps => ({
  allowedOrigins: ["https://nobit.test"],
  appUrl: "https://miniapp.line.me/123-abc",
  authenticate: async (t) => (t === "op" ? { userId: "op1", role: "operator" } : t === "ca" ? { userId: "ca1", role: "club_admin" } : null),
  quota: async () => ({ limit: 200, used: 10 }),
  sentThisMonth: async () => 4,
  reserve: async (_op, items) => items.map((i, n): Reserved => (i.alertIds[0] === A3
    ? { ok: false, reason: "contact_off" }
    : { ok: true, pushId: `p${n}`, lineUserId: `U${n}`, text: i.text, retryKey: `k${n}` })),
  push: async (to, _m, key) => { calls.push(`push:${to}:${key}`); return { status: 200, requestId: "req" }; },
  finish: async (id, ok, _r, err) => { calls.push(`finish:${id}:${ok}${err ? ":" + err : ""}`); },
  log: () => {},
  ...over,
});
const post = (body: unknown, token = "op") =>
  new Request("https://f.test/line-push", { method: "POST", body: JSON.stringify(body), headers: { ...ORIGIN, Authorization: `Bearer ${token}` } });
const send = (items: unknown, over: Partial<Deps> = {}) => handle(post({ action: "send", items }), base(over));

// 入力
assert.deepEqual(parseItems([{ alertIds: [A1], text: " 今日も、ひとつ育てよう。 " }]), [{ alertIds: [A1], text: "今日も、ひとつ育てよう。" }]);
assert.equal(parseItems([]), null);
assert.equal(parseItems([{ alertIds: ["x"], text: "a" }]), null);
assert.equal(parseItems([{ alertIds: [A1], text: "  " }]), null);
assert.equal(parseItems([{ alertIds: [A1], text: "あ".repeat(501) }]), null);
assert.equal(parseItems(Array.from({ length: 51 }, () => ({ alertIds: [A1], text: "a" }))), null);

// メッセージ：URL があればボタン、長い本文は URL を下に足す、URL がなければ本文だけ
const m1 = buildMessages("今日も、ひとつ育てよう。", "https://miniapp.line.me/123-abc")[0] as { type: string; template: { actions: { label: string; uri: string }[] } };
assert.equal(m1.type, "template");
assert.equal(m1.template.actions[0].label, OPEN_LABEL);
assert.equal(m1.template.actions[0].uri, "https://miniapp.line.me/123-abc");
const m2 = buildMessages("あ".repeat(200), "https://miniapp.line.me/123-abc")[0] as { type: string; text: string };
assert.equal(m2.type, "text");
assert.ok(m2.text.endsWith("https://miniapp.line.me/123-abc"));
assert.deepEqual(buildMessages("やあ", null), [{ type: "text", text: "やあ" }]);

// 認証・権限
const st = async (r: Response) => [r.status, (await r.json()).error ?? "ok"];
assert.deepEqual(await st(await handle(new Request("https://f.test/", { method: "POST", body: "{}", headers: ORIGIN }), base())), [401, "unauthorized"]);
assert.deepEqual(await st(await handle(post({ action: "quota" }, "ca"), base())), [403, "forbidden"]);
assert.equal((await handle(new Request("https://f.test/", { method: "OPTIONS", headers: ORIGIN }), base())).status, 204);
assert.deepEqual(await st(await handle(post({ action: "zzz" }), base())), [400, "bad_request"]);

// 残り通数
let r = await handle(post({ action: "quota" }), base());
assert.deepEqual(await r.json(), { limit: 200, used: 10, remaining: 190, sentByNobit: 4 });
r = await handle(post({ action: "quota" }), base({ quota: async () => ({ limit: null, used: 10 }) }));
assert.equal((await r.json()).remaining, null);
assert.deepEqual(await st(await handle(post({ action: "quota" }), base({ quota: async () => { throw new Error("x"); } }))), [502, "line_unavailable"]);

// 送る：送れるものだけ送り、結果を記録する
calls = [];
r = await send([{ alertIds: [A1, A2], text: "今日も" }, { alertIds: [A3], text: "x" }]);
let b = await r.json();
assert.equal(r.status, 200);
assert.equal(b.sent, 1);
assert.deepEqual(b.results, [{ alertIds: [A1, A2], ok: true }, { alertIds: [A3], ok: false, reason: "contact_off" }]);
assert.deepEqual(calls, ["push:U0:k0", "finish:p0:true"]);

// 残りが足りなければ1通も送らない
calls = [];
r = await send([{ alertIds: [A1], text: "a" }, { alertIds: [A2], text: "b" }], { quota: async () => ({ limit: 200, used: 199 }) });
assert.equal(r.status, 409);
assert.deepEqual(await r.json(), { error: "quota", remaining: 1 });
assert.deepEqual(calls, []);
assert.deepEqual(await st(await send([{ alertIds: [A1], text: "a" }], { quota: async () => { throw new Error("x"); } })), [502, "line_unavailable"]);

// 409（同じ再送キーで受け付け済み）は届いた扱い。429 のあとは送らない。それ以外のエラーは失敗として記録
calls = [];
const statuses = [409, 429, 200];
r = await send([{ alertIds: [A1], text: "a" }, { alertIds: [A2], text: "b" }, { alertIds: ["aaaaaaaa-0000-0000-0000-000000000004"], text: "c" }], {
  push: async (to): Promise<PushResult> => { calls.push("push:" + to); return { status: statuses.shift() ?? 200, requestId: null }; },
});
b = await r.json();
assert.deepEqual(b.results.map((x: { ok: boolean; reason?: string }) => x.reason ?? "ok"), ["ok", "quota", "quota"]);
assert.deepEqual(calls, ["push:U0", "finish:p0:true", "push:U1", "finish:p1:false:quota", "finish:p2:false:quota"]);

calls = [];
r = await send([{ alertIds: [A1], text: "a" }], { push: async () => ({ status: 400, requestId: "r1" }) });
assert.equal((await r.json()).results[0].reason, "line_error");
assert.deepEqual(calls, ["finish:p0:false:http_400"]);

calls = [];
r = await send([{ alertIds: [A1], text: "a" }], { push: async () => { throw new Error("net"); } });
assert.equal((await r.json()).results[0].reason, "line_error");
assert.deepEqual(calls, ["finish:p0:false:network"]);

console.log("line-push handler: ok");
