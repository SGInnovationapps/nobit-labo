import { useCallback, useEffect, useState } from "react";
import { newRequestId, rpc } from "../lib/api";
import { atLeast } from "../lib/config";
import { dateLabel, durationLabel } from "../lib/format";
import type { Completion, DayTask, Home, StudyResult, StudyStatus } from "../lib/types";
import { RecordStrip } from "../components/RecordStrip";
import { SubjectText } from "../components/SubjectText";
import { CompleteSheet } from "./CompleteSheet";
import { FreeEntrySheet } from "./FreeEntrySheet";
import { SettingsSheet } from "./SettingsSheet";
import { SlideToConfirm } from "../components/SlideToConfirm";
import { StudyTimer } from "./StudyTimer";
import { StudyResultSheet } from "./StudyResultSheet";

/** ノビットの一文（ホームは画像を出さず、名前を添えた一文だけ） */
function nobitLine(h: Home): string {
  const done = h.tasks.filter((t) => t.completed_at).length;
  const open = h.tasks.filter((t) => !t.completed_at).length;
  if (done === 0 && h.today_rest) return "休息日。しっかり休もう。";
  if (done > 0 && open === 0) return "今日の分、ぜんぶ育った。";
  if (done > 0) return `いい調子。あと${open}つ。`;
  if (h.streak.current === 0 && h.streak.best > 0) return "また今日から。ひとつ育てよう。";
  return "今日も、ひとつ育てよう。";
}

function taskMeta(t: DayTask) {
  const parts: string[] = [];
  if (t.est_minutes) parts.push(`${t.est_minutes}分`);
  if (t.recurrence === "once" && t.due_date) parts.push(`期限 ${dateLabel(t.due_date)}`);
  return parts.join("　");
}

// 01 ホーム・今日のクエスト
export function HomeScreen() {
  const [home, setHome] = useState<Home | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [sheet, setSheet] = useState<"free" | "settings" | null>(null);
  const [study, setStudy] = useState<StudyStatus | null>(null);
  const [studyResult, setStudyResult] = useState<StudyResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, st] = await Promise.all([rpc<Home>("my_home"), rpc<StudyStatus>("study_status")]);
      setHome(h);
      setStudy(st);
      // アプリを閉じている間に止まったタイマーは、開いたときに記録を見せる
      if (!st.active && st.pending_result) setStudyResult(st.pending_result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const startStudy = async () => {
    setError(null);
    try {
      setStudy(await rpc<StudyStatus>("start_study", { p_request_id: newRequestId() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const closeStudyResult = async () => {
    const r = studyResult;
    setStudyResult(null);
    if (r && r.end_reason !== "manual") await rpc("ack_study", { p_session_id: r.id }).catch(() => undefined);
    await load();
  };
  useEffect(() => {
    load();
  }, [load]);

  const complete = async (t: DayTask) => {
    if (busy) return;
    setBusy(t.id);
    setError(null);
    try {
      const c = await rpc<Completion>("complete_task", { p_user_task_id: t.id, p_request_id: newRequestId() });
      if (!c.already) setCompletion({ ...c, title: c.title ?? t.title ?? "", subject: c.subject ?? t.subject ?? undefined });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!home) return error ? <p className="center-note" role="alert">{error}</p> : <p className="center-note">読み込んでいます</p>;

  const done = home.tasks.filter((t) => t.completed_at).length;
  const comment = home.comment;

  // タイマーが動いていれば、開いたときからタイマーの画面にする
  if (study?.active && !studyResult) {
    return (
      <StudyTimer
        key={study.active.id}
        status={study}
        onEnded={(r) => {
          setStudy((s) => (s ? { ...s, active: null } : s));
          if (r) setStudyResult(r);
          else load();
        }}
      />
    );
  }

  return (
    <main className="s-app">
      <div className="s-top">
        <span><strong>{home.me.display_name}</strong>　{home.me.grade}</span>
        <span>{dateLabel(home.today)}</span>
      </div>

      <section className="s-streak" aria-label="連続記録">
        <span className="s-streak-num num">{home.streak.current}</span>
        <span className="s-streak-unit">日<br />連続</span>
        <div className="s-streak-meta">
          <span>最長<span className="num">{home.streak.best}</span>日</span>
          {atLeast(2) && (
            <span className="s-coin">コイン<span className="num">{home.me.coins}</span></span>
          )}
        </div>
      </section>

      <RecordStrip className="s-strip" days={home.strip} today={home.today} axis={["30日前", "今日"]} />

      <p className="s-nobit">
        <b>ノビット</b>
        {nobitLine(home)}
      </p>

      {comment && (
        <p className="s-comment">
          <b>{comment.author}さんから</b>
          {comment.body}
        </p>
      )}

      {study && (
        <section className="s-section" aria-labelledby="study-h">
          <div className="s-section-head">
            <h2 id="study-h">勉強タイマー</h2>
            <span className="s-study-total">今日 <span className="num">{durationLabel(study.today.seconds)}</span></span>
          </div>
          <div className="s-study">
            <SlideToConfirm label="スライドして勉強を始める" onConfirm={startStudy} />
            <p className="s-study-note">
              机に置いたまま使えます。{study.config.block_minutes}分たまるごとに1ブロック{atLeast(2) && `、${study.config.block_reward}コイン`}。
            </p>
          </div>
        </section>
      )}

      <section className="s-section" aria-labelledby="today-h">
        <div className="s-section-head">
          <h2 id="today-h">今日のタスク</h2>
          {home.tasks.length > 0 && (
            <span className="num">{done}<small> / {home.tasks.length}</small></span>
          )}
        </div>
        {home.tasks.length === 0 && (
          <p className="s-empty">今日配られたタスクはありません。やった勉強があれば、下から記録できます。</p>
        )}
        {home.tasks.map((t) =>
          t.completed_at ? (
            <div key={t.id} className="s-task done">
              <span className="s-task-time">{t.completed_time}</span>
              <div>
                <SubjectText subject={t.subject} />
                <div className="s-task-title">{t.title}</div>
              </div>
              <span className="visually-hidden">完了</span>
            </div>
          ) : (
            <div key={t.id} className="s-task">
              <SubjectText subject={t.subject} />
              <div>
                <div className="s-task-title">{t.title}</div>
                <div className="s-task-meta">{taskMeta(t)}</div>
              </div>
              <button className="s-done-btn" disabled={busy !== null} onClick={() => complete(t)} aria-label={`${t.title}を完了にする`}>
                {busy === t.id ? "記録中" : "完了"}
              </button>
            </div>
          ),
        )}
        {error && <p className="s-error" role="alert">{error}</p>}
      </section>

      {home.free_entry.enabled && (
        <section className="s-section">
          <button className="s-secondary" disabled={home.free_entry.remaining === 0} onClick={() => setSheet("free")}>
            やった勉強を記録する
            <small>{home.free_entry.remaining > 0 ? `今日はあと${home.free_entry.remaining}件` : "今日の分は記録済み"}</small>
          </button>
        </section>
      )}

      <button className="s-link" onClick={() => setSheet("settings")}>LINE への連絡の設定</button>

      {completion && (
        <CompleteSheet
          completion={completion}
          today={home.today}
          onClose={() => {
            setCompletion(null);
            if (comment && !comment.read) rpc("mark_comment_read", { p_comment_id: comment.id }).catch(() => undefined);
          }}
        />
      )}
      {sheet === "free" && (
        <FreeEntrySheet
          remaining={home.free_entry.remaining}
          onClose={() => setSheet(null)}
          onDone={async (c) => {
            setSheet(null);
            setCompletion(c);
            await load();
          }}
        />
      )}
      {studyResult && study && (
        <StudyResultSheet
          result={studyResult}
          config={study.config}
          openTasks={home.tasks.filter((t) => !t.completed_at)}
          busy={busy}
          onComplete={async (t) => {
            const r = studyResult;
            setStudyResult(null);
            if (r.end_reason !== "manual") await rpc("ack_study", { p_session_id: r.id }).catch(() => undefined);
            await complete(t);
          }}
          onClose={closeStudyResult}
        />
      )}
      {sheet === "settings" && (
        <SettingsSheet
          optIn={home.me.line_contact_opt_in}
          onClose={() => setSheet(null)}
          onChanged={load}
        />
      )}
    </main>
  );
}
