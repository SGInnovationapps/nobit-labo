// 実行：node --experimental-strip-types handler.test.ts
import assert from "node:assert/strict";
import { type Admin, type Deps, handle, normalizeEmail } from "./handler.ts";

const CLUB = "11111111-1111-1111-1111-111111111111";
const UID = "22222222-2222-2222-2222-222222222222";
const ORIGIN = { Origin: "https://nobit.test" };
const calls: string[] = [];
let live: string | null = null;
let existingRole: string | null = null;
const admins: Admin[] = [{ userId: UID, email: "a@example.test", displayName: "［管理者名］" }];

const base = (over: Partial<Deps> = {}): Deps => ({
  allowedOrigins: ["https://nobit.test"],
  authenticate: async (t) => (t === "op" ? { userId: "op1", role: "operator" } : t === "ca" ? { userId: "ca1", role: "club_admin" } : null),
  ensureUser: async (e) => { calls.push("ensure:" + e); return { userId: UID, role: existingRole }; },
  upsertAdmin: async (_u, n) => { calls.push("upsert:" + n); },
  liveClub: async () => live,
  addMember: async (c, u, o) => { calls.push(`add:${c}:${u}:${o}`); },
  leaveMember: async () => true,
  listAdmins: async () => admins,
  log: () => {},
  ...over,
});
const post = (body: unknown, token = "op", headers: Record<string, string> = {}) =>
  new Request("https://f.test/club-admin", { method: "POST", body: JSON.stringify(body), headers: { ...ORIGIN, Authorization: `Bearer ${token}`, ...headers } });
const status = async (r: Response) => [r.status, (await r.json()).error ?? "ok"];

assert.equal(normalizeEmail("  A@Example.test "), "a@example.test");
assert.equal(normalizeEmail("nope"), null);
assert.equal(normalizeEmail(5), null);

// 認証・権限
assert.deepEqual(await status(await handle(new Request("https://f.test/", { method: "POST", body: "{}", headers: ORIGIN }), base())), [401, "unauthorized"]);
assert.deepEqual(await status(await handle(post({ action: "list", clubId: CLUB }, "ca"), base())), [403, "forbidden"]);
assert.deepEqual(await status(await handle(post({ action: "list", clubId: CLUB }, "zz"), base())), [401, "unauthorized"]);
assert.deepEqual(await status(await handle(new Request("https://f.test/", { method: "POST", body: "{}", headers: { Origin: "https://evil.test", Authorization: "Bearer op" } }), base())), [403, "origin_not_allowed"]);
assert.equal((await handle(new Request("https://f.test/", { method: "OPTIONS", headers: ORIGIN }), base())).status, 204);

// 一覧・不正な入力
let r = await handle(post({ action: "list", clubId: CLUB }), base());
assert.equal((await r.json()).admins.length, 1);
assert.deepEqual(await status(await handle(post({ action: "list", clubId: "x" }), base())), [400, "bad_request"]);
assert.deepEqual(await status(await handle(post({ action: "add", clubId: CLUB, email: "bad" }), base())), [400, "invalid_email"]);
assert.deepEqual(await status(await handle(post({ action: "add", clubId: CLUB, email: "a@example.test", displayName: "あ".repeat(21) }), base())), [400, "invalid_name"]);
assert.deepEqual(await status(await handle(post({ action: "zzz", clubId: CLUB }), base())), [400, "bad_request"]);

// 追加
r = await handle(post({ action: "add", clubId: CLUB, email: " A@Example.test ", displayName: " ［管理者名］ " }), base());
assert.equal(r.status, 200);
assert.deepEqual(calls, ["ensure:a@example.test", "upsert:［管理者名］", `add:${CLUB}:${UID}:op1`]);
calls.length = 0;

// 生徒・運営のアドレスは書き換えない／すでに管理者／別のクラブに所属中
existingRole = "student";
assert.deepEqual(await status(await handle(post({ action: "add", clubId: CLUB, email: "a@example.test" }), base())), [409, "not_allowed"]);
existingRole = "club_admin"; live = CLUB;
assert.deepEqual(await status(await handle(post({ action: "add", clubId: CLUB, email: "a@example.test" }), base())), [409, "already_admin"]);
live = "99999999-9999-9999-9999-999999999999";
assert.deepEqual(await status(await handle(post({ action: "add", clubId: CLUB, email: "a@example.test" }), base())), [409, "other_club"]);
assert.deepEqual(calls.filter((c) => c.startsWith("add:") || c.startsWith("upsert:")), []);

// 解除
assert.equal((await handle(post({ action: "remove", clubId: CLUB, userId: UID }), base())).status, 200);
assert.deepEqual(await status(await handle(post({ action: "remove", clubId: CLUB, userId: UID }), base({ leaveMember: async () => false }))), [404, "not_found"]);
assert.deepEqual(await status(await handle(post({ action: "remove", clubId: CLUB, userId: "x" }), base())), [400, "bad_request"]);

// 内部エラー
assert.deepEqual(await status(await handle(post({ action: "list", clubId: CLUB }), base({ listAdmins: async () => { throw new Error("x"); } }))), [500, "server_error"]);
console.log("club-admin ok");
