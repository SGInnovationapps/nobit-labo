import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../lib/api";
import { ALERT_LABEL, FRIEND_LABEL, STATE_LABEL, dateLabel, jstDateTime, shortDate } from "../lib/format";
import type { AlertItem, Overview, OverviewStudent } from "../lib/types";
import { RecordStrip } from "../components/RecordStrip";
import { ClubPicker, useAdmin } from "./AdminApp";

const FILTERS = ["all", "all_done", "partial", "not_started", "rest"] as const;
type Filter = (typeof FILTERS)[number];

// 09 生徒一覧（既定の並びは対応が必要な順）
export function StudentList() {
  const { me, clubId } = useAdmin();
  const op = me.role === "operator";
  const [data, setData] = useState<Overview | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      setData(await rpc<Overview>("admin_overview", { p_club: clubId }));
      if (op) setAlerts(await rpc<AlertItem[]>("admin_alerts", { p_club: clubId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clubId, op]);
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () =>
      (data?.students ?? []).filter(
        (s) => (filter === "all" || s.state === filter) && (!q || s.display_name.includes(q.trim())),
      ),
    [data, filter, q],
  );
  const clubStrip = useMemo(() => {
    const days = data?.club_strip ?? [];
    const max = Math.max(1, ...days.map((d) => d.n));
    return days.map((d) => ({ d: d.d, n: d.n === 0 ? 0 : Math.ceil((d.n / max) * 3), rest: null }));
  }, [data]);
  const clubTotal = (data?.club_strip ?? []).reduce((a, d) => a + d.n, 0);

  return (
    <>
      <header className="a-head">
        <h1>生徒一覧</h1>
        <ClubPicker />
        {data && <span className="date">{dateLabel(data.today)}</span>}
      </header>
      {error && <p className="error-line" role="alert">{error}</p>}
      {data && (
        <div className="l-grid">
          <div>
            <section className="panel">
              <div className="l-summary">
                {(["all_done", "partial", "not_started", "rest"] as const).map((k) => (
                  <div key={k} className="l-sum">
                    <span className="num">{data.summary[k]}</span>
                    <span className={`state ${k}`}>{STATE_LABEL[k]}</span>
                  </div>
                ))}
                <div className="l-club">
                  <span className="note">クラブ全体の完了タスク（直近14日）　<b className="num" style={{ fontSize: 15, color: "var(--ink)" }}>{clubTotal}</b> 件</span>
                  <RecordStrip days={clubStrip} today={data.today} height={34} axis={[shortDate(clubStrip[0]?.d ?? data.today), "今日"]} />
                </div>
              </div>
            </section>

            <div className="l-filters" role="group" aria-label="状態で絞り込む">
              {FILTERS.map((f) => (
                <button key={f} className="l-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? `すべて ${data.summary.students}` : STATE_LABEL[f]}
                </button>
              ))}
              <input className="l-search" type="search" placeholder="名前で探す" value={q} onChange={(e) => setQ(e.target.value)} aria-label="名前で探す" />
            </div>

            <section className="panel" style={{ paddingTop: 12 }}>
              <div className="l-row head">
                <span>生徒</span><span>今日</span><span>状態</span><span>連続</span>
                <span>直近14日</span><span>最長</span><span>最終学習</span><span />
              </div>
              {rows.length === 0 && <p className="muted">該当する生徒はいません。</p>}
              {rows.map((s) => <Row key={s.id} s={s} today={data.today} />)}
            </section>
          </div>

          {op && <AlertPanel alerts={alerts} onChanged={load} />}
        </div>
      )}
    </>
  );
}

function Row({ s, today }: { s: OverviewStudent; today: string }) {
  const times = s.tasks.filter((t) => t.completed_time).map((t) => t.completed_time);
  return (
    <div className="l-row">
      <div className="l-c-name">
        <Link className="l-name" to={`/admin/students/${s.id}`}>{s.display_name}<small>{s.grade}</small></Link>
        {s.gap_days >= 3 && <span className="l-flag">記録が{s.gap_days}日空いています</span>}
      </div>
      <div className="l-times l-c-today">
        <span className="l-done num">{s.done}/{s.total}</span>
        {times.map((t, i) => <span key={i} className="num">{t}</span>)}
      </div>
      <span className={`state ${s.state} l-c-state`}>{STATE_LABEL[s.state]}</span>
      <span className="l-streak l-c-streak"><span className="num">{s.streak}</span><span className="l-unit">日連続</span></span>
      <RecordStrip className="l-c-strip" days={s.strip} today={today} height={26} gap={2} />
      <span className="num l-c-best">{s.best}</span>
      <span className="l-c-last" style={{ fontSize: 12 }}>{s.last_study ? shortDate(s.last_study) : "—"}</span>
      <Link className="btn quiet l-c-btn" to={`/admin/students/${s.id}#support`}>応援する</Link>
    </div>
  );
}

/** 対応アラート（運営のみ）。公式LINE のチャットから送り、送ったら連絡済みにする */
function AlertPanel({ alerts, onChanged }: { alerts: AlertItem[]; onChanged: () => Promise<void> }) {
  const [copied, setCopied] = useState<string | null>(null);
  const open = alerts.filter((a) => a.status === "open");
  const recent = alerts.filter((a) => a.status === "contacted");
  const copy = async (a: AlertItem) => {
    await navigator.clipboard.writeText(a.message);
    setCopied(a.id);
  };
  const act = async (fn: string, id: string) => {
    await rpc(fn, { p_alert_id: id });
    await onChanged();
  };
  return (
    <aside className="panel alerts" aria-label="対応アラート">
      <h2>対応アラート <span className="num">{open.length}</span></h2>
      <p className="note" style={{ marginTop: -6 }}>文面をコピーして、公式LINE のチャットから1人ずつ送ります。送ったら「連絡済み」にします。</p>
      {open.length === 0 && <p className="muted">いま対応が必要なアラートはありません。</p>}
      {open.map((a) => (
        <div key={a.id} className="alert">
          <div className="alert-top">
            <span className="alert-kind">{ALERT_LABEL[a.kind] ?? a.kind}</span>
            <span className="muted">{shortDate(a.alert_date)}</span>
          </div>
          <div className="alert-who">
            <Link to={`/admin/students/${a.student_id}`}>{a.student_name}</Link> <small className="muted">{a.grade}</small>
            {a.friend_status !== "friend" && <span className="l-flag">公式LINE：{FRIEND_LABEL[a.friend_status]}</span>}
          </div>
          <div className="alert-msg">{a.message}</div>
          <div className="btn-row">
            <button className="btn" onClick={() => copy(a)}>{copied === a.id ? "コピーしました" : "文面をコピー"}</button>
            <button className="btn primary" onClick={() => act("admin_mark_contacted", a.id)}>連絡済みにする</button>
            <button className="btn quiet" onClick={() => act("admin_dismiss_alert", a.id)}>送らない</button>
          </div>
        </div>
      ))}
      {recent.length > 0 && (
        <>
          <h2 style={{ marginTop: 18 }}>連絡済み <small>直近3日</small></h2>
          {recent.map((a) => (
            <div key={a.id} className="alert done">
              <div className="alert-top">
                <span><b>{a.student_name}</b>　{ALERT_LABEL[a.kind] ?? a.kind}</span>
                <span className="muted">{a.contacted_at && jstDateTime(a.contacted_at)}</span>
              </div>
              <span className="alert-done">その後の完了 {a.completions_after ?? 0}件</span>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}
