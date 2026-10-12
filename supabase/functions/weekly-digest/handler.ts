// 週1回のメール「今週の記録」。依存を引数で受け取るので、Deno なしでもテストできる。
// 載せるのは人数だけ。生徒の名前・教科・コインは載せない（クラブ管理者に見せる範囲を超えないため）。

export type Digest = {
  club_id: string;
  club_name: string;
  week_start: string; // YYYY-MM-DD
  week_end: string;
  total: number;
  studied: number;
  idle: number;
  unsupported: number;
  emails: string[];
};

export type Deps = {
  /** 呼び出しの合言葉（cron から送る） */
  secret: string;
  /** 管理画面のURL */
  adminUrl: string;
  /** 今日（JST）。省略時は DB 側の既定 */
  today?: string;
  fetchDigests(today?: string): Promise<Digest[]>;
  send(mail: { to: string; subject: string; text: string }): Promise<void>;
  markSent(club: string, weekStart: string, recipients: number): Promise<void>;
  log(message: string, detail?: unknown): void;
};

const md = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;

export function buildMail(d: Digest, adminUrl: string): { subject: string; text: string } {
  const lines = [
    `${d.club_name} の管理者のみなさまへ`,
    "",
    `${md(d.week_start)}〜${md(d.week_end)}の記録です。`,
    "",
    `学習した人数　　　　　：${d.studied}人（承認済み ${d.total}人のうち）`,
    `しばらく記録がない生徒：${d.idle}人`,
    `応援がまだの生徒　　　：${d.unsupported}人（この1週間にコメントや「見たよ」がない人）`,
    "",
    "くわしくは管理画面で確認できます。",
    adminUrl,
    "",
    "NOBIT!",
  ];
  return { subject: `［NOBIT!］今週の記録（${md(d.week_start)}〜${md(d.week_end)}）`, text: lines.join("\n") };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const json = (b: unknown, s: number) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!deps.secret || req.headers.get("x-cron-secret") !== deps.secret) return json({ error: "unauthorized" }, 401);

  const digests = await deps.fetchDigests(deps.today);
  let sent = 0, skipped = 0, failed = 0;
  for (const d of digests) {
    // 生徒がいないクラブ・宛先がないクラブには送らない（記録も残さない。あとで宛先ができれば次の回に送れる）
    if (d.total === 0 || d.emails.length === 0) { skipped++; continue; }
    const mail = buildMail(d, deps.adminUrl);
    let ok = 0;
    for (const to of d.emails) {
      try { await deps.send({ to, ...mail }); ok++; }
      catch (e) { deps.log("send_failed", { club: d.club_id, error: String(e) }); }
    }
    if (ok === 0) { failed++; continue; }
    // 1通でも届けば、その週は済みにする（二重送信を避ける）
    await deps.markSent(d.club_id, d.week_start, ok);
    sent++;
  }
  return json({ sent, skipped, failed }, 200);
}
