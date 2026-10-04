import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "../lib/api";
import { atLeast } from "../lib/config";
import { SUBJECTS, WEEKDAYS, shortDate, todayJst } from "../lib/format";
import type { Subject, TaskGroup } from "../lib/types";
import { SubjectText } from "../components/SubjectText";
import { useAdmin } from "./AdminApp";

const STATUS = [
  ["active", "配信中"],
  ["scheduled", "予定"],
  ["ended", "終了"],
] as const;

function schedule(t: TaskGroup) {
  const base =
    t.recurrence === "once"
      ? `1回だけ　期限 ${t.due_date ? shortDate(t.due_date) : ""}`
      : t.recurrence === "daily"
        ? "毎日"
        : `毎週 ${(t.weekdays ?? []).map((w) => WEEKDAYS[w - 1]).join("・")}`;
  const range = t.recurrence === "once" ? "" : `　${shortDate(t.starts_on)}〜${t.ends_on ? shortDate(t.ends_on) : ""}`;
  return base + range;
}

type ClubFree = { id: string; name: string; free_entry_enabled: boolean };

// 11 タスク管理（運営のみ）
export function TaskManager() {
  const { me } = useAdmin();
  const [tasks, setTasks] = useState<TaskGroup[]>([]);
  const [clubs, setClubs] = useState<ClubFree[]>([]);
  const [tab, setTab] = useState<TaskGroup["status"]>("active");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await rpc<TaskGroup[]>("admin_tasks"));
      setClubs(await rpc<ClubFree[]>("admin_clubs_free_entry"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => tasks.filter((t) => t.status === tab), [tasks, tab]);

  return (
    <>
      <header className="a-head">
        <h1>タスク管理</h1>
        <button className="btn primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "作成をやめる" : "タスクを作る"}
        </button>
      </header>
      {error && <p className="error-line" role="alert">{error}</p>}
      {open && (
        <NewTask
          clubs={me.clubs ?? []}
          onCreated={async () => {
            setOpen(false);
            setTab("active");
            await load();
          }}
        />
      )}

      <section className="panel">
        <div className="tabs" role="tablist">
          {STATUS.map(([k, label]) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label} <span className="num">{tasks.filter((t) => t.status === k).length}</span>
            </button>
          ))}
        </div>
        <div className="t-row head">
          <span>教科</span><span>タスク</span><span>対象クラブ</span><span>期限・くり返し</span><span>今日の完了</span><span />
        </div>
        {list.length === 0 && <p className="muted">該当するタスクはありません。</p>}
        {list.map((t) => (
          <div key={t.group_id} className="t-row">
            <SubjectText subject={t.subject} />
            <span>
              <span className="t-title">{t.title}</span>
              <br />
              <small className="muted">
                {t.est_minutes}分{atLeast(2) && `　${t.reward_coins}コイン`}
              </small>
            </span>
            <span style={{ fontSize: 13 }}>{t.clubs.map((c) => c.name).join("、")}</span>
            <span style={{ fontSize: 13 }}>{schedule(t)}</span>
            <span className="t-rate">
              <span className="num">{t.done}</span>
              <span className="muted"> / {t.assigned}</span>
              {t.assigned > 0 && <small className="muted">　{Math.round((t.done / t.assigned) * 100)}%</small>}
            </span>
            <span>
              {t.status !== "ended" && (
                <button
                  className="btn quiet"
                  onClick={async () => {
                    if (!window.confirm(`「${t.title}」の配信を終えますか？これまでの記録は残ります。`)) return;
                    await rpc("admin_archive_task", { p_group_id: t.group_id });
                    await load();
                  }}
                >
                  配信を終える
                </button>
              )}
            </span>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>生徒の自由登録 <small>［仮］1件5コイン・1日3件まで</small></h2>
        {clubs.map((c) => (
          <div key={c.id} className="toggle-row">
            <span>
              {c.name}　<b className={c.free_entry_enabled ? "" : "muted"}>{c.free_entry_enabled ? "使う" : "使わない"}</b>
            </span>
            <button
              className="btn quiet"
              onClick={async () => {
                await rpc("admin_set_free_entry", { p_club_id: c.id, p_enabled: !c.free_entry_enabled });
                await load();
              }}
            >
              {c.free_entry_enabled ? "止める" : "使う"}
            </button>
          </div>
        ))}
      </section>
    </>
  );
}

function NewTask({ clubs, onCreated }: { clubs: { id: string; name: string }[]; onCreated: () => Promise<void> }) {
  const today = todayJst();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<Subject>("english");
  const [clubIds, setClubIds] = useState<string[]>(clubs.map((c) => c.id));
  const [recurrence, setRecurrence] = useState<"once" | "daily" | "weekly">("daily");
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [startsOn, setStartsOn] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [endsOn, setEndsOn] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [coins, setCoins] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const valid =
    title.trim().length > 0 && clubIds.length > 0 &&
    (recurrence !== "weekly" || weekdays.length > 0) &&
    (recurrence !== "once" || dueDate >= startsOn);

  const submit = async () => {
    setError(null);
    try {
      await rpc("admin_create_task", {
        p_club_ids: clubIds,
        p_title: title.trim(),
        p_subject: subject,
        p_recurrence: recurrence,
        p_starts_on: startsOn,
        p_due_date: recurrence === "once" ? dueDate : null,
        p_weekdays: recurrence === "weekly" ? weekdays : null,
        p_ends_on: recurrence !== "once" && endsOn ? endsOn : null,
        p_est_minutes: minutes,
        p_reward_coins: atLeast(2) ? coins : null,
      });
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <section className="panel" aria-label="タスクを作る">
      <h2>タスクを作る</h2>
      <div className="form-grid">
        <label style={{ gridColumn: "1 / -1" }}>
          タスク名（40文字まで）
          <input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder="例：英単語 20個" />
        </label>
        <fieldset>
          <legend>教科</legend>
          <div className="seg">
            {SUBJECTS.map((s) => (
              <button key={s.code} type="button" aria-pressed={subject === s.code} onClick={() => setSubject(s.code)}>{s.label}</button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>くり返し</legend>
          <div className="seg">
            {(["once", "daily", "weekly"] as const).map((r) => (
              <button key={r} type="button" aria-pressed={recurrence === r} onClick={() => setRecurrence(r)}>
                {r === "once" ? "1回だけ" : r === "daily" ? "毎日" : "曜日を指定"}
              </button>
            ))}
          </div>
        </fieldset>
        {recurrence === "weekly" && (
          <fieldset>
            <legend>曜日</legend>
            <div className="checks">
              {WEEKDAYS.map((w, i) => (
                <label key={w}>
                  <input type="checkbox" checked={weekdays.includes(i + 1)} onChange={() => setWeekdays(toggle(weekdays, i + 1))} />
                  {w}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label>
          {recurrence === "once" ? "出す日" : "配信の開始日"}
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        {recurrence === "once" ? (
          <label>
            期限
            <input type="date" value={dueDate} min={startsOn} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        ) : (
          <label>
            配信の終了日（空なら続ける）
            <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
        )}
        <label>
          目安時間（分）
          <input type="number" min={1} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </label>
        {atLeast(2) && (
          <label>
            報酬コイン（［仮］標準10）
            <input type="number" min={0} max={100} value={coins} onChange={(e) => setCoins(Number(e.target.value))} />
          </label>
        )}
        <fieldset style={{ gridColumn: "1 / -1" }}>
          <legend>対象クラブ</legend>
          <div className="checks">
            {clubs.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={clubIds.includes(c.id)} onChange={() => setClubIds(toggle(clubIds, c.id))} />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {error && <p className="error-line" role="alert">{error}</p>}
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={!valid} onClick={submit}>配信する</button>
      </div>
    </section>
  );
}
