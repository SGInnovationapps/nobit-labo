// 実行：node --experimental-strip-types handler.test.ts
import assert from "node:assert/strict";
import { buildMail, type Deps, type Digest, handle } from "./handler.ts";

const d = (o: Partial<Digest> = {}): Digest => ({
  club_id: "c1", club_name: "［クラブ名］", week_start: "2026-10-05", week_end: "2026-10-11",
  total: 10, studied: 7, idle: 2, unsupported: 3, emails: ["a@example.test", "b@example.test"], ...o,
});
const sent: string[] = [], marked: string[] = [];
const base = (digests: Digest[], over: Partial<Deps> = {}): Deps => ({
  secret: "s", adminUrl: "https://admin.test/",
  fetchDigests: async () => digests,
  send: async (m) => { sent.push(m.to); },
  markSent: async (c, w, n) => { marked.push(`${c}:${w}:${n}`); },
  log: () => {}, ...over,
});
const post = (h: Record<string, string> = { "x-cron-secret": "s" }) => new Request("https://f.test/", { method: "POST", headers: h });

const m = buildMail(d(), "https://admin.test/");
assert.match(m.subject, /10月5日〜10月11日/);
assert.match(m.text, /学習した人数.*7人/);
assert.match(m.text, /記録がない生徒.*2人/);
assert.match(m.text, /応援がまだ.*3人/);
assert.match(m.text, /https:\/\/admin\.test\//);

let r = await handle(post({}), base([d()]));
assert.equal(r.status, 401);
r = await handle(new Request("https://f.test/"), base([d()]));
assert.equal(r.status, 405);
assert.deepEqual(sent, []);

r = await handle(post(), base([d(), d({ club_id: "c2", total: 0 }), d({ club_id: "c3", emails: [] })]));
assert.deepEqual(await r.json(), { sent: 1, skipped: 2, failed: 0 });
assert.deepEqual(sent, ["a@example.test", "b@example.test"]);
assert.deepEqual(marked, ["c1:2026-10-05:2"]);

// 1通失敗しても、届いた分があれば済みにする。全部失敗なら記録しない
marked.length = 0;
r = await handle(post(), base([d()], { send: async (m) => { if (m.to.startsWith("a")) throw new Error("x"); } }));
assert.deepEqual(await r.json(), { sent: 1, skipped: 0, failed: 0 });
assert.deepEqual(marked, ["c1:2026-10-05:1"]);
marked.length = 0;
r = await handle(post(), base([d()], { send: async () => { throw new Error("x"); } }));
assert.deepEqual(await r.json(), { sent: 0, skipped: 0, failed: 1 });
assert.deepEqual(marked, []);
console.log("weekly-digest ok");
