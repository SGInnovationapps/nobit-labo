import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { rpc } from "../lib/api";
import { atLeast } from "../lib/config";
import { ALERT_LABEL, END_REASON_LABEL, FRIEND_LABEL, dateLabel, durationLabel, jstDateTime, shortDate } from "../lib/format";
import type { StripDay, StudentDetail as Detail } from "../lib/types";
import { SubjectText } from "../components/SubjectText";
import { useAdmin } from "./AdminApp";

/** 12週の記録：月曜はじまりの7行×12〜13列 */
function Weeks({ days, today }: { days: StripDay[]; today: string }) {
  const cells = useMemo(() => {
    if (days.length === 0) return [];
    const first = new Date(`${days[0].d}T00:00:00Z`);
    const pad = (first.getUTCDay() + 6) % 7; // 月曜=0
    const list: { key: string; cls: string; title: string }[] = [];
    for (let i = 0; i < pad; i++) list.push({ key: `p${i}`, cls: "future", title: "" });
    for (const d of days) {
      const lv = Math.min(d.n, 3);
      const cls = d.n > 0 ? `lv${lv}` : d.rest ? "rest" : "";
      list.push({
        key: d.d,
        cls: `${cls}${d.d === today ? " today" : ""}`,
        title: `${shortDate(d.d)} ${d.n > 0 ? `${d.n}件` : d.rest ? "休息日" : "記録なし"}`,
      });
    }
    while (list.length % 7) list.push({ key: `f${list.length}`, cls: "future", title: "" });
    return list;
  }, [days, today]);
  const studied = days.filter((d) => d.n > 0).length;
  return (
    <>
      <div className="weeks-wrap" role="img" aria-label={`12週のうち記録した日 ${studied}日`}>
        <div className="weeks-days" aria-hidden="true">{["月", "", "水", "", "金", "", "日"].map((w, i) => <span key={i}>{w}</span>)}</div>
        <div className="weeks">{cells.map((c) => <span key={c.key} className={c.cls} title={c.title} />)}</div>
      </div>
      <div className="legend">
        <span><i style={{ background: "var(--empty)" }} />記録なし</span>
        <span><i style={{ background: "#a8ead6" }} />1つ</span>
        <span><i style={{ background: "#6fdcbc" }} />2つ</span>
        <span><i style={{ background: "var(--mint)" }} />3つ以上</span>
        <span><i style={{ background: "var(--purple)" }} />休息日</span>
      </div>
    </>
  );
}

// 10 生徒の詳細・応援
export function StudentDetail() {
  const { id } = useParams();
  const { me } = useAdmin();
  const [d, setD] = useState<Detail | null>(null);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await rpc<Detail>("admin_student_detail", { p_student_id: id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (d && window.location.hash === "#support") document.getElementById("support")?.scrollIntoView();
  }, [d]);

  const post = async () => {
    setMsg(null);
    try {
      await rpc("admin_post_comment", { p_student_id: id, p_body: body.trim() });
      setBody("");
      setMsg("送りました。生徒のホームに表示されます。");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  if (error) return <p className="error-line" role="alert">{error}</p>;
  if (!d) return null;
  const today = d.strip[d.strip.length - 1]?.d ?? "";
  const maxSub = Math.max(1, ...d.subjects.map((s) => s.n));
  const op = d.viewer_role === "operator";

  return (
    <>
      <Link className="a-back" to="/admin">生徒一覧に戻る</Link>
      <header className="d-head">
        <h1>{d.student.display_name}</h1>
        <span>{d.student.grade}</span>
        <span className="muted">{d.student.club_name}</span>
        {op && <span className="muted">公式LINE：{FRIEND_LABEL[d.student.friend_status]}{!d.student.line_contact_opt_in && "（連絡を止めています）"}</span>}
      </header>

      <div className="d-nums">
        <div className="d-num"><span className="num">{d.streak.current}<small>日</small></span><span>連続記録</span></div>
        <div className="d-num"><span className="num">{d.streak.best}<small>日</small></span><span>最長記録</span></div>
        <div className="d-num"><span className="num">{d.month_days}<small>日</small></span><span>今月の学習日</span></div>
        {d.focus_minutes_month !== null ? (
          <div className="d-num"><span className="num">{durationLabel(d.focus_minutes_month * 60)}</span><span>今月の勉強時間（タイマー）</span></div>
        ) : (
          <div className="d-num"><span className="num">{d.history.length > 0 ? shortDate(d.history[0].date) : "—"}</span><span>最終学習</span></div>
        )}
      </div>

      <div className="d-cols">
        <div>
          <section className="panel">
            <h2>12週の記録</h2>
            <Weeks days={d.strip} today={today} />
          </section>
          <section className="panel">
            <h2>学習履歴 <small>新しい順</small></h2>
            {d.history.length === 0 && <p className="muted">まだ記録がありません。</p>}
            <ul className="hist">
              {d.history.map((h, i) => (
                <li key={i}>
                  <span>{dateLabel(h.date)}</span>
                  <span className="num">{h.time}</span>
                  <SubjectText subject={h.subject} hiddenLabel="—" />
                  <span>{h.is_free ? (h.title ?? "自由登録（内容は表示しません）") : h.title}{h.is_free && h.title && <small className="muted">　自由登録</small>}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div>
          <section className="panel">
            <h2>教科別 <small>直近30日</small></h2>
            <div className="bars">
              {d.subjects.length === 0 && <p className="muted">直近30日の記録はありません。</p>}
              {d.subjects.map((s) => (
                <div key={s.subject ?? "x"} className="bar-row">
                  <SubjectText subject={s.subject} />
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${(s.n / maxSub) * 100}%`, display: "block" }} /></span>
                  <span className="num">{s.n}</span>
                </div>
              ))}
            </div>
            {!op && d.free_count_30 > 0 && (
              <p className="note">ほかに自由登録が {d.free_count_30}件あります（内容は表示しません）。</p>
            )}
          </section>

          <section className="panel" id="support">
            <h2>応援</h2>
            {me.role === "club_admin" && (
              <div className="comment-form">
                <label htmlFor="cmt" className="note">アプリのホームに表示されます（200文字まで）</label>
                <textarea id="cmt" value={body} maxLength={200} onChange={(e) => setBody(e.target.value)} placeholder="例：大会前でも続けられていてすごいね" />
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn primary" disabled={!body.trim()} onClick={post}>応援コメントを送る</button>
                </div>
                {msg && <p className="ok-line">{msg}</p>}
              </div>
            )}
            {op && (
              <p className="note">運営からの連絡は、公式LINE のチャットから送り、生徒一覧のアラートで「連絡済み」にします。</p>
            )}
            {d.comments.length === 0 && <p className="muted">まだ応援コメントはありません。</p>}
            {d.comments.map((c) => (
              <div key={c.id} className="comment">
                {c.body}
                <br />
                <small>{c.author}　{jstDateTime(c.created_at)}　{c.read ? "既読" : "未読"}</small>
              </div>
            ))}
          </section>

          {op && d.alerts && (
            <section className="panel">
              <h2>アラートと連絡</h2>
              {d.alerts.length === 0 && <p className="muted">まだアラートはありません。</p>}
              {d.alerts.map((a) => (
                <div key={a.id} className="comment">
                  <b>{ALERT_LABEL[a.kind] ?? a.kind}</b>　<span className="muted">{shortDate(a.alert_date)}</span>
                  <br />
                  {a.message}
                  <br />
                  <small>
                    {a.status === "contacted" && a.contacted_at
                      ? `連絡済み ${jstDateTime(a.contacted_at)}　その後の完了 ${a.completions_after ?? 0}件`
                      : a.status === "open" ? "未対応" : "送らなかった"}
                  </small>
                </div>
              ))}
            </section>
          )}

          {d.study_sessions && (
            <section className="panel">
              <h2>勉強タイマー <small>直近10回・運営だけに表示</small></h2>
              {d.study_sessions.length === 0 && <p className="muted">まだ記録がありません。</p>}
              {d.study_sessions.map((x, i) => (
                <div key={i} className="toggle-row" style={{ fontSize: 13 }}>
                  <span>{dateLabel(x.date)}　<span className="num">{x.started_time}〜{x.ended_time}</span></span>
                  <span><b className="num">{x.minutes}</b>分　<span className="muted">{END_REASON_LABEL[x.end_reason] ?? ""}</span></span>
                </div>
              ))}
            </section>
          )}

          {atLeast(2) && (
            <section className="panel">
              <h2>休息チケット</h2>
              {d.tickets.length === 0 && <p className="muted">まだ配布されていません。</p>}
              {d.tickets.map((t) => (
                <div key={t.week} className="toggle-row">
                  <span>{shortDate(t.week)} の週</span>
                  <span>{t.used_on ? `${dateLabel(t.used_on)} に使用` : "未使用"}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
      {!op && (
        <p className="note" style={{ marginTop: 16 }}>
          クラブの管理者には、完了したタスクと記録の帯だけを表示しています（保護者の同意の範囲）。勉強タイマーの時間は表示しません。
        </p>
      )}
    </>
  );
}
